import { candidateExportSchema, dataExportKey } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import { ERASED, ORG_A, ORG_B, createInMemoryTaskQueue, seedPrivacyData, userActor } from '../../testing/index.js';
import { buildOrganizationExport, listExports, openExport, requestOrganizationExport } from './organization-export.js';

const admin = userActor({ id: 'user_a', role: 'admin', organizationId: ORG_A });
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('requestOrganizationExport', () => {
  it('creates a pending request that expires in 7 days, queues the task and audits it', async () => {
    const deps = await seedPrivacyData();
    const created = await requestOrganizationExport(deps, admin, {});
    expect(created).toMatchObject({ organizationId: ORG_A, requestedBy: 'user_a', status: 'pending', sizeBytes: null, completedAt: null });
    expect(created.expiresAt.getTime() - deps.now().getTime()).toBe(7 * 24 * 3600 * 1000);
    expect(deps.queue.jobs()).toContainEqual({ name: 'organization.export', payload: { organizationId: ORG_A, exportId: created.id } });
    expect(deps.auditLog.events().find((e) => e.action === 'organization.exported')).toMatchObject({ target: { type: 'data_export', id: created.id }, metadata: { step: 'requested' } });
  });

  it('marks the request failed when it cannot be queued', async () => {
    const seeded = await seedPrivacyData();
    const deps = { ...seeded, queue: createInMemoryTaskQueue(new Error('queue down')) };
    await expect(requestOrganizationExport(deps, admin, {})).rejects.toThrow('queue down');
    expect(seeded.dataExports.snapshot()).toMatchObject([{ status: 'failed' }]);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['recruiter', false],
    ['hiring_manager', false],
    ['interviewer', false],
  ] as const)('role %s may request: %s', async (role, allowed) => {
    const deps = await seedPrivacyData();
    const run = requestOrganizationExport(deps, userActor({ role, organizationId: ORG_A }), {});
    if (allowed) await expect(run).resolves.toBeDefined();
    else expect(await rejection(run)).toBeInstanceOf(ForbiddenError);
  });
});

describe('buildOrganizationExport', () => {
  it('writes organization.json, jobs, candidates in the public schema, files and a README, stores the ZIP and marks it ready', async () => {
    const deps = await seedPrivacyData();
    const created = await requestOrganizationExport(deps, admin, {});
    const done = await buildOrganizationExport(deps, { organizationId: ORG_A, exportId: created.id });
    const paths = deps.zip.writers()[0]!.entries().map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['README.txt', 'organization.json', 'jobs/job_1.json', 'candidates/cand_1.json', 'candidates/cand_2.json', 'files/app_1/zelda.pdf', 'files/app_3/bruno.pdf']));
    const candidate = deps.zip.writers()[0]!.entries().find((e) => e.path === 'candidates/cand_1.json')!;
    expect(candidateExportSchema.safeParse(JSON.parse(new TextDecoder().decode(candidate.bytes))).success).toBe(true);
    const stored = await deps.files.get(dataExportKey(ORG_A, created.id));
    expect(done).toMatchObject({ status: 'ready', sizeBytes: stored.byteLength });
    expect(done.completedAt).not.toBeNull();
  });

  it('only exports the organization of the request', async () => {
    const deps = await seedPrivacyData();
    const created = await requestOrganizationExport(deps, userActor({ role: 'owner', organizationId: ORG_B }), {});
    await buildOrganizationExport(deps, { organizationId: ORG_B, exportId: created.id });
    expect(deps.zip.writers()[0]!.entries().map((e) => e.path).filter((p) => p.startsWith('candidates/'))).toEqual([]);
    expect(await rejection(buildOrganizationExport(deps, { organizationId: ORG_A, exportId: created.id }))).toBeInstanceOf(NotFoundError);
  });

  it('marks the request failed when building throws, and is idempotent for finished requests', async () => {
    const seeded = await seedPrivacyData();
    const created = await requestOrganizationExport(seeded, admin, {});
    const broken = { ...seeded, files: { ...seeded.files, put: async () => Promise.reject(new Error('disk full')) } };
    await expect(buildOrganizationExport(broken, { organizationId: ORG_A, exportId: created.id })).rejects.toThrow('disk full');
    expect(seeded.dataExports.snapshot()[0]?.status).toBe('failed');
    const again = await buildOrganizationExport(seeded, { organizationId: ORG_A, exportId: created.id });
    expect(again.status).toBe('failed');
  });
});

describe('listExports and openExport', () => {
  it('lists the organization exports, newest first, to owners and admins only', async () => {
    const deps = await seedPrivacyData();
    await requestOrganizationExport(deps, admin, {});
    expect(await listExports(deps, admin, {})).toHaveLength(1);
    expect(await listExports(deps, userActor({ role: 'owner', organizationId: ORG_B }), {})).toEqual([]);
    expect(await rejection(listExports(deps, userActor({ role: 'recruiter', organizationId: ORG_A }), {}))).toBeInstanceOf(ForbiddenError);
  });

  it('downloads a ready export and audits the download', async () => {
    const deps = await seedPrivacyData();
    const created = await requestOrganizationExport(deps, admin, {});
    expect(await rejection(openExport(deps, admin, { exportId: created.id }))).toBeInstanceOf(ConflictError);
    await buildOrganizationExport(deps, { organizationId: ORG_A, exportId: created.id });
    const file = await openExport(deps, admin, { exportId: created.id });
    expect(file).toMatchObject({ mediaType: 'application/zip', fileName: `export-${created.id}.zip` });
    expect(new TextDecoder().decode(file.bytes)).toContain(ERASED.email);
    expect(deps.auditLog.events().filter((e) => e.action === 'organization.exported').map((e) => e.metadata)).toEqual([{ step: 'requested' }, { step: 'downloaded' }]);
  });

  it('answers not found for expired exports, foreign organizations and roles without data:export', async () => {
    const deps = await seedPrivacyData();
    const created = await requestOrganizationExport(deps, admin, {});
    await buildOrganizationExport(deps, { organizationId: ORG_A, exportId: created.id });
    expect(await rejection(openExport(deps, userActor({ role: 'owner', organizationId: ORG_B }), { exportId: created.id }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(openExport(deps, userActor({ role: 'recruiter', organizationId: ORG_A }), { exportId: created.id }))).toBeInstanceOf(ForbiddenError);
    const expired = { ...deps, now: () => new Date(deps.now().getTime() + 8 * 24 * 3600 * 1000) };
    expect(await rejection(openExport(expired, admin, { exportId: created.id }))).toBeInstanceOf(NotFoundError);
  });
});
