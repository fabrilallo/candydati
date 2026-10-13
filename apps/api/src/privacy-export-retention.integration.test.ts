import { buildOrganizationExport, runRetention } from '@tt/core';
import { candidateExportSchema, dataExportKey } from '@tt/domain';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAs, createWorld, exportDeps, leftovers, retentionDeps, setRetention } from './testing/privacy-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

const DAY = 24 * 3600 * 1000;

interface ExportDto { id: string; status: string; sizeBytes: number | null; expiresAt: string }
interface Retention {
  upcoming: { applicationId: string; candidateId: string; candidateName: string; jobTitle: string; retentionExpiresAt: string }[];
  lastRuns: { id: string; warned: number; erased: number }[];
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

/** What the worker does with the queued `organization.export` tasks of this app. */
async function buildQueuedExports(organizationId: string): Promise<void> {
  for (const job of t.queue.jobs().filter((j) => j.name === 'organization.export' && (j.payload as { organizationId: string }).organizationId === organizationId)) {
    await buildOrganizationExport(exportDeps(t), job.payload as { organizationId: string; exportId: string });
  }
}

describe('organization export', () => {
  it('goes from request to worker to download to expiry cleanup', async () => {
    const w = await createWorld(t);
    const x = await applyAs(w);
    const requested = await w.owner.post<{ id: string; status: string }>('/api/v1/exports');
    expect(requested.status).toBe(202);
    expect(requested.body.data).toMatchObject({ status: 'pending' });
    const id = requested.body.data!.id;
    expect((await w.owner.get(`/api/v1/exports/${id}/download`)).status).toBe(409);

    await buildQueuedExports(await orgIdOf(w.owner.organizationSlug));
    const listed = (await w.owner.get<ExportDto[]>('/api/v1/exports')).body.data!;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id, status: 'ready' });
    expect(listed[0]!.sizeBytes).toBeGreaterThan(100);
    expect(new Date(listed[0]!.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * DAY);

    const download = await w.owner.download(`/api/v1/exports/${id}/download`);
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('application/zip');
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.headers['content-disposition']).toContain(`export-${id}.zip`);
    const entries = unzipSync(new Uint8Array(download.rawPayload));
    const names = Object.keys(entries);
    expect(names).toEqual(expect.arrayContaining(['README.txt', 'organization.json', `jobs/${w.job.id}.json`, `candidates/${x.candidateId}.json`, `files/${x.applicationId}/Giulia Bianchi.pdf`]));
    expect(candidateExportSchema.safeParse(JSON.parse(strFromU8(entries[`candidates/${x.candidateId}.json`]!))).success).toBe(true);
    const { rows: audited } = await t.handle.pool.query<{ metadata: { step: string } }>(`select metadata from audit_log where action = 'organization.exported' and target_id = $1 order by occurred_at`, [id]);
    expect(audited.map((r) => r.metadata.step)).toEqual(['requested', 'downloaded']);

    // Expired: the download is gone and the retention job deletes the row and the ZIP.
    const orgId = await orgIdOf(w.owner.organizationSlug);
    await t.handle.pool.query(`update data_export set expires_at = now() - interval '1 day' where id = $1`, [id]);
    expect((await w.owner.get(`/api/v1/exports/${id}/download`)).status).toBe(404);
    expect(t.files.keys()).toContain(dataExportKey(orgId, id));
    const result = await runRetention(retentionDeps(t), { now: new Date() });
    expect(result.exportsDeleted).toBeGreaterThanOrEqual(1);
    expect(t.files.keys()).not.toContain(dataExportKey(orgId, id));
    expect((await w.owner.get<ExportDto[]>('/api/v1/exports')).body.data).toEqual([]);
  });

  it('is for owner and admin only, and isolated per organization', async () => {
    const w = await createWorld(t);
    const other = await createWorld(t, 'Other');
    for (const role of ['recruiter', 'hiring_manager', 'interviewer']) {
      const user = await w.member(role);
      expect((await user.post('/api/v1/exports')).status).toBe(403);
      expect((await user.get('/api/v1/exports')).status).toBe(403);
      expect((await user.get('/api/v1/exports/x/download')).status).toBe(403);
    }
    const admin = await w.member('admin');
    const mine = await admin.post<{ id: string }>('/api/v1/exports');
    expect(mine.status).toBe(202);
    expect((await other.owner.get<ExportDto[]>('/api/v1/exports')).body.data).toEqual([]);
    expect((await other.owner.get(`/api/v1/exports/${mine.body.data!.id}/download`)).status).toBe(404);
  });
});

const orgIdOf = async (slug: string): Promise<string> =>
  (await t.handle.pool.query<{ id: string }>(`select id from organization where slug = $1`, [slug])).rows[0]!.id;

describe('retention job', () => {
  it('erases an expired application, warns about one expiring in 10 days and records the run', async () => {
    const w = await createWorld(t);
    const expired = await applyAs(w);
    const soon = await applyAs(w);
    const later = await applyAs(w);
    const now = new Date();
    await setRetention(t, expired.applicationId, new Date(now.getTime() - DAY));
    await setRetention(t, soon.applicationId, new Date(now.getTime() + 10 * DAY));
    const orgId = await orgIdOf(w.owner.organizationSlug);
    const admin = await w.member('admin');

    const overview = (await w.owner.get<Retention>('/api/v1/privacy/retention')).body.data!;
    expect(overview.upcoming.map((u) => u.applicationId).sort()).toEqual([expired.applicationId, soon.applicationId].sort());
    expect(overview.upcoming.find((u) => u.applicationId === soon.applicationId)).toMatchObject({ candidateName: `${soon.person.firstName} ${soon.person.lastName}`, jobTitle: 'Backend Developer' });

    const result = await runRetention(retentionDeps(t), { now });
    expect(result.failures).toEqual([]);
    expect(result.runs.filter((r) => r.organizationId === orgId)).toMatchObject([{ warned: 1, erased: 1 }]);
    expect(result.digests.filter((d) => d.organizationId === orgId).map((d) => d.userId).length).toBe(2);

    expect(await leftovers(t, [expired.applicationId, expired.person.email, expired.person.lastName])).toEqual({});
    expect(t.files.keys().some((k) => k.includes(expired.applicationId))).toBe(false);
    expect((await w.owner.get(`/api/v1/candidates/${expired.candidateId}`)).status).toBe(404);
    expect((await w.owner.get(`/api/v1/candidates/${soon.candidateId}`)).status).toBe(200);
    expect((await w.owner.get(`/api/v1/candidates/${later.candidateId}`)).status).toBe(200);
    const { rows } = await t.handle.pool.query(`select metadata from audit_log where action = 'candidate.erased' and target_id = $1`, [expired.candidateId]);
    expect(rows).toEqual([{ metadata: { reason: 'retention', applicationCount: 1 } }]);

    for (const user of [w.owner, admin]) {
      const notes = (await user.get<{ kind: string; applicationId: string | null }[]>('/api/v1/notifications')).body.data!;
      expect(notes.filter((n) => n.kind === 'retention_expiring').map((n) => n.applicationId)).toEqual([soon.applicationId]);
    }
    expect((await (await w.member('recruiter')).get<{ kind: string }[]>('/api/v1/notifications')).body.data!.filter((n) => n.kind === 'retention_expiring')).toEqual([]);

    const again = await runRetention(retentionDeps(t), { now: new Date(now.getTime() + DAY) });
    expect(again.digests.filter((d) => d.organizationId === orgId)).toEqual([]);
    const after = (await w.owner.get<Retention>('/api/v1/privacy/retention')).body.data!;
    expect(after.upcoming.map((u) => u.applicationId)).toEqual([soon.applicationId]);
    expect(after.lastRuns).toMatchObject([{ warned: 1, erased: 1 }]);
  });

  it('shows the overview and the processing record to owner and admin only, without secrets', async () => {
    const w = await createWorld(t);
    for (const role of ['recruiter', 'hiring_manager', 'interviewer']) {
      const user = await w.member(role);
      expect((await user.get('/api/v1/privacy/retention')).status).toBe(403);
      expect((await user.get('/api/v1/privacy/processing-record')).status).toBe(403);
    }
    const record = await (await w.member('admin')).get<Record<string, unknown>>('/api/v1/privacy/processing-record');
    expect(record.status).toBe(200);
    expect(record.body.data).toMatchObject({
      organization: { name: 'Acme', contactEmail: 'privacy@acme.example' },
      privacyNoticeVersion: 1,
      providers: { storage: 's3 (localhost:9000)', email: 'log', model: 'nessuno' },
    });
    expect(JSON.stringify(record.body)).not.toMatch(/test-secret|S3_|password/i);
  });
});
