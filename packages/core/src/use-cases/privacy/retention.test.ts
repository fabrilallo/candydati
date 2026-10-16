import { attachmentKey, type DataExport } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../errors.js';
import { buildApplication, buildCandidate, ERASED, ORG_A, ORG_B, seedPrivacyData, seedPrivacyWorld, userActor, createInMemoryTaskQueue } from '../../testing/index.js';
import { getProcessingRecord, getRetentionOverview } from './retention-overview.js';
import { markDigestsEmailed } from '../automations/scan-deadlines.js';
import { runRetention } from './run-retention.js';

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2027-06-01T03:00:00Z');
const at = (days: number): Date => new Date(NOW.getTime() + days * DAY);
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

const world = (expiries: Record<string, Date>) =>
  seedPrivacyData({
    applications: ['app_1', 'app_2', 'app_3'].map((id) =>
      buildApplication({
        id,
        organizationId: ORG_A,
        candidateId: id === 'app_3' ? 'cand_2' : 'cand_1',
        outcome: id === 'app_2' ? 'not_selected' : null,
        retentionExpiresAt: expiries[id] ?? at(300),
        cv: { key: `organizations/org_a/applications/${id}/cv`, fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 64 },
      }),
    ),
  });

describe('runRetention', () => {
  it('warns owners and admins once per application, in the digest, and never twice', async () => {
    const deps = await world({ app_1: at(10) });
    const first = await runRetention(deps, { now: NOW });
    const warnings = deps.notifications.snapshot().filter((n) => n.kind === 'retention_expiring');
    expect(warnings.map((n) => [n.userId, n.applicationId]).toSorted()).toEqual([['admin_1', 'app_1'], ['user_test', 'app_1']]);
    expect(warnings[0]?.payload).toEqual({ retentionExpiresAt: at(10).toISOString() });
    expect(first.digests.map((d) => d.userId).toSorted()).toEqual(['admin_1', 'user_test']);
    expect(first.runs).toMatchObject([{ organizationId: ORG_A, warned: 1, erased: 0 }]);
    await markDigestsEmailed(deps.notifications, first.digests, NOW);
    const second = await runRetention(deps, { now: new Date(NOW.getTime() + DAY) });
    expect(second.digests).toEqual([]);
    expect(deps.notifications.snapshot().filter((n) => n.kind === 'retention_expiring')).toHaveLength(2);
    expect(deps.store.read().applications).toHaveLength(3);
  });

  it('erases expired applications, open ones included, with reason retention, and the candidate left without applications', async () => {
    const deps = await world({ app_1: at(-1), app_2: at(-5) });
    const result = await runRetention(deps, { now: NOW });
    expect(deps.store.read().applications.map((a) => a.id)).toEqual(['app_3']);
    expect(deps.store.read().candidates.map((c) => c.id)).toEqual(['cand_2']);
    expect(deps.files.keys()).toEqual(['organizations/org_a/applications/app_3/cv']);
    expect(result.runs).toMatchObject([{ organizationId: ORG_A, warned: 0, erased: 2 }]);
    expect(deps.retentionRuns.snapshot()).toHaveLength(1);
    const events = deps.auditLog.events().filter((e) => e.action === 'candidate.erased');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor: { type: 'system', id: null }, metadata: { reason: 'retention', applicationCount: 2 } });
  });

  it('erases the attachments of expired applications with them: rows and files', async () => {
    const deps = await world({ app_1: at(-1) });
    const key = attachmentKey(ORG_A, 'app_1', 'att_1');
    await deps.files.put(key, new Uint8Array([1]), 'application/pdf');
    const attachment = { id: 'att_1', organizationId: ORG_A, applicationId: 'app_1', migrationBatchId: null, kind: 'cover_letter' as const, fileName: 'l.pdf', mediaType: 'application/pdf' as const, sizeBytes: 1, key, createdAt: NOW };
    deps.store.write({ attachments: [attachment] });
    await runRetention(deps, { now: NOW });
    expect(deps.store.read().attachments).toEqual([]);
    expect(deps.files.keys()).not.toContain(key);
  });

  it('counts an erasure whose files could not be deleted or queued as erased, and reports the orphaned keys', async () => {
    const seeded = await world({ app_1: at(-1), app_2: at(-5) });
    const deps = { ...seeded, files: { ...seeded.files, delete: async () => Promise.reject(new Error('s3 down')) }, queue: createInMemoryTaskQueue(new Error('queue down')) };
    const result = await runRetention(deps, { now: NOW });
    expect(seeded.store.read().applications.map((a) => a.id)).toEqual(['app_3']);
    expect(result.failures).toEqual([]);
    expect(result.runs).toMatchObject([{ organizationId: ORG_A, erased: 2 }]);
    expect(result.orphanedFiles).toEqual([{ organizationId: ORG_A, keys: ['organizations/org_a/applications/app_1/cv', 'organizations/org_a/applications/app_2/cv'] }]);
    expect(await runRetention(deps, { now: NOW })).toMatchObject({ failures: [], orphanedFiles: [] });
  });

  it('keeps the candidate while one of their applications has not expired', async () => {
    const deps = await world({ app_1: at(-1) });
    await runRetention(deps, { now: NOW });
    expect(deps.store.read().applications.map((a) => a.id)).toEqual(['app_2', 'app_3']);
    expect(deps.store.read().candidates.map((c) => c.id)).toEqual(['cand_1', 'cand_2']);
  });

  it('does nothing and stores no run when nothing expires', async () => {
    const deps = await world({});
    const result = await runRetention(deps, { now: NOW });
    expect(result).toMatchObject({ digests: [], runs: [], exportsDeleted: 0, failures: [] });
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('keeps going when one candidate fails and reports it', async () => {
    const seeded = await world({ app_1: at(-1), app_3: at(-1) });
    const failFor = (id: string) => ({ ...seeded.erasure, run: <T,>(work: Parameters<typeof seeded.erasure.run<T>>[0]) => seeded.erasure.run((r) => work({ ...r, store: { ...r.store, deleteCandidate: async (o: string, c: string) => (c === id ? Promise.reject(new Error('boom')) : r.store.deleteCandidate(o, c)) } })) });
    const deps = { ...seeded, erasure: failFor('cand_2') };
    const result = await runRetention(deps, { now: NOW });
    expect(result.failures).toEqual([{ organizationId: ORG_A, candidateId: 'cand_2', message: 'boom' }]);
    expect(seeded.store.read().applications.map((a) => a.id)).toEqual(['app_2', 'app_3']);
    expect(result.runs).toMatchObject([{ erased: 1 }]);
  });

  it('deletes expired organization exports and their files, and keeps the others', async () => {
    const make = (id: string, expiresAt: Date): DataExport => ({ id, organizationId: ORG_A, requestedBy: 'u', status: 'ready', sizeBytes: 1, createdAt: at(-8), completedAt: at(-8), expiresAt });
    const deps = seedPrivacyWorld({ candidates: [], applications: [], extractions: [], dataExports: [make('old', at(-1)), make('fresh', at(3))] });
    await deps.files.put(`organizations/${ORG_A}/exports/old.zip`, new Uint8Array([1]), 'application/zip');
    await deps.files.put(`organizations/${ORG_A}/exports/fresh.zip`, new Uint8Array([1]), 'application/zip');
    const result = await runRetention(deps, { now: NOW });
    expect(result.exportsDeleted).toBe(1);
    expect(deps.dataExports.snapshot().map((e) => e.id)).toEqual(['fresh']);
    expect(deps.files.keys()).toContain(`organizations/${ORG_A}/exports/fresh.zip`);
    expect(deps.files.keys()).not.toContain(`organizations/${ORG_A}/exports/old.zip`);
  });

  it('keeps the export row when its file can be neither deleted nor queued', async () => {
    const seeded = seedPrivacyWorld({ candidates: [], applications: [], extractions: [], dataExports: [{ id: 'old', organizationId: ORG_A, requestedBy: 'u', status: 'ready', sizeBytes: 1, createdAt: at(-8), completedAt: at(-8), expiresAt: at(-1) }] });
    const deps = { ...seeded, files: { ...seeded.files, delete: async () => Promise.reject(new Error('down')) }, queue: createInMemoryTaskQueue(new Error('down')) };
    const result = await runRetention(deps, { now: NOW });
    expect(result.exportsDeleted).toBe(0);
    expect(seeded.dataExports.snapshot()).toHaveLength(1);
  });

  it('rejects a non-date now', async () => {
    const deps = await world({});
    expect(await rejection(runRetention(deps, { now: 'today' }))).toBeInstanceOf(ValidationError);
  });
});

describe('getRetentionOverview', () => {
  it('lists upcoming expiries with names and the latest runs, for owner and admin only', async () => {
    const deps = await seedPrivacyData({
      retentionRuns: [
        { id: 'r1', organizationId: ORG_A, startedAt: at(-2), warned: 1, erased: 0 },
        { id: 'r2', organizationId: ORG_A, startedAt: at(-1), warned: 0, erased: 2 },
        { id: 'rb', organizationId: ORG_B, startedAt: at(-1), warned: 9, erased: 9 },
      ],
      applications: [
        buildApplication({ id: 'app_1', candidateId: 'cand_1', organizationId: ORG_A, retentionExpiresAt: at(10) }),
        buildApplication({ id: 'app_far', candidateId: 'cand_1', organizationId: ORG_A, outcome: 'hired', retentionExpiresAt: at(200) }),
        buildApplication({ id: 'app_3', candidateId: 'cand_2', organizationId: ORG_A, retentionExpiresAt: at(2) }),
      ],
      candidates: [buildCandidate({ id: 'cand_1', ...ERASED, organizationId: ORG_A }), buildCandidate({ id: 'cand_2', email: 'b@x.it', firstName: 'B', lastName: 'C', organizationId: ORG_A })],
    });
    const clocked = { ...deps, now: () => NOW };
    const overview = await getRetentionOverview(clocked, userActor({ role: 'admin', organizationId: ORG_A }), {});
    expect(overview.upcoming.map((u) => [u.applicationId, u.candidateName, u.jobTitle])).toEqual([
      ['app_3', 'B C', 'Backend Developer'],
      ['app_1', 'Zelda Quuxington', 'Backend Developer'],
    ]);
    expect(overview.lastRuns.map((r) => r.id)).toEqual(['r2', 'r1']);
    for (const role of ['recruiter', 'hiring_manager', 'interviewer'] as const) {
      expect(await rejection(getRetentionOverview(clocked, userActor({ role, organizationId: ORG_A }), {}))).toBeInstanceOf(ForbiddenError);
    }
    const other = await getRetentionOverview(clocked, userActor({ role: 'owner', organizationId: ORG_B }), {});
    expect(other.upcoming).toEqual([]);
    expect(other.lastRuns.map((r) => r.id)).toEqual(['rb']);
  });
});

describe('getProcessingRecord', () => {
  it('returns the organization name, the contact and retention of the active notice and the configured providers', async () => {
    const deps = await seedPrivacyData();
    const record = await getProcessingRecord(deps, userActor({ role: 'owner', organizationId: ORG_A }), {});
    expect(record).toEqual({
      organizationName: 'Acme',
      contactEmail: 'privacy@acme.example',
      noticeVersion: 1,
      retentionDays: { selection: 365, talent_pool: 730 },
      providers: { storage: 'local', email: 'smtp', model: 'openai/gpt-test' },
    });
  });

  it('has null contact and retention before a notice exists, and is closed to other roles and organizations', async () => {
    const deps = await seedPrivacyData();
    const empty = await getProcessingRecord(deps, userActor({ role: 'owner', organizationId: ORG_B }), {});
    expect(empty).toMatchObject({ organizationName: 'Beta', contactEmail: null, noticeVersion: null, retentionDays: null });
    expect(await rejection(getProcessingRecord(deps, userActor({ role: 'recruiter', organizationId: ORG_A }), {}))).toBeInstanceOf(ForbiddenError);
  });
});
