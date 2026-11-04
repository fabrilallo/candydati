import { randomUUID } from 'node:crypto';
import { and, count, eq, schema } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDemoSeed, type RunResult } from './demo-seed/run.js';
import { DemoSeedError } from './demo-seed/store/target.js';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

let t: TestApp;
let owner: TestUser;
let organizationId: string;
const lines: string[] = [];
const NOW = new Date();

const seed = (organization: string, apply = true): Promise<RunResult> =>
  runDemoSeed({ db: t.handle.db, files: t.files, organization, apply, now: NOW, log: (line) => lines.push(line) });

const countIn = async (table: typeof schema.job | typeof schema.candidate | typeof schema.application | typeof schema.auditLog, orgId: string): Promise<number> => {
  const [row] = await t.handle.db.select({ value: count() }).from(table).where(eq(table.organizationId, orgId));
  return row?.value ?? 0;
};

beforeAll(async () => {
  t = await createTestApp();
  owner = await new TestUser(t.app, uniqueEmail('owner'), 'Giulia Rossi').signUp();
  await owner.createOrganization('Officina Demo');
  const [org] = await t.handle.db.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.slug, owner.organizationSlug));
  organizationId = org!.id;
});
afterAll(async () => {
  await t.close();
});

describe('demo seed', () => {
  it('prints the plan and writes nothing without the confirmation', async () => {
    const result = await seed(owner.organizationSlug, false);
    expect(result.outcome).toBe('dry_run');
    expect(lines.join('\n')).toContain('job ads: 5 to create, 0 already there');
    expect(await countIn(schema.job, organizationId)).toBe(0);
    expect(t.files.keys()).toEqual([]);
  });

  it('fills the organization so the product reads it back through its own API', async () => {
    const result = await seed(owner.organizationSlug);
    expect(result.outcome).toBe('applied');

    const jobs = (await owner.get<{ id: string; status: string; title: string }[]>('/api/v1/jobs')).body.data!;
    expect(jobs.map((job) => job.status).sort()).toEqual(['closed', 'draft', 'published', 'published', 'published']);
    const backend = jobs.find((job) => job.title.startsWith('Backend'))!;
    const pipeline = await owner.get<{ applications: { id: string; candidate: { id: string } }[] }>(`/api/v1/jobs/${backend.id}/pipeline`);
    expect(pipeline.status).toBe(200);
    expect(pipeline.body.data!.applications.length).toBeGreaterThan(5);

    const first = pipeline.body.data!.applications[0]!;
    const details = await owner.get<{ applications: { extraction: { status: string; source: string | null; data: { headline?: string } | null } }[] }>(`/api/v1/candidates/${first.candidate.id}`);
    expect(details.status).toBe(200);
    const extraction = details.body.data!.applications[0]!.extraction;
    expect(extraction).toMatchObject({ status: 'done', source: 'model' });
    expect(extraction.data?.headline).toBeTruthy();
    const cv = await owner.download(`/api/v1/applications/${first.id}/cv`);
    expect(cv.statusCode).toBe(200);
    expect(cv.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    expect((await owner.get<unknown[]>('/api/v1/clients')).body.data).toHaveLength(1);
    const period = `from=${new Date(NOW.getTime() - 90 * 86_400_000).toISOString()}&to=${NOW.toISOString()}`;
    expect((await owner.get(`/api/v1/reports?${period}`)).status).toBe(200);
    expect((await owner.get('/api/v1/email-templates')).status).toBe(200);
    const page = await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${owner.organizationSlug}/careers-page` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Costruiamo il software che fa funzionare gli studi medici');
    const publicJobs = await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${owner.organizationSlug}/jobs` });
    expect(publicJobs.statusCode).toBe(200);
    expect(publicJobs.body).toContain('Backend Developer');
    expect(publicJobs.body).not.toContain('Frontend Developer');
  });

  it('never scores a candidate: no score in what the product returns about people', async () => {
    const [application] = await t.handle.db.select().from(schema.application).where(eq(schema.application.organizationId, organizationId)).limit(1);
    const details = await owner.get(`/api/v1/candidates/${application!.candidateId}`);
    expect(JSON.stringify(details.body)).not.toMatch(/"(score|rank|rating)"/);
  });

  it('records the seed in the audit log as the system', async () => {
    const events = await t.handle.db.select().from(schema.auditLog).where(and(eq(schema.auditLog.organizationId, organizationId), eq(schema.auditLog.action, 'application.received')));
    expect(events).toHaveLength(40);
    expect(events.every((event) => event.actorType === 'system' && (event.metadata as { demoSeed?: boolean }).demoSeed === true)).toBe(true);
  });

  it('adds nothing when it runs again', async () => {
    const before = await Promise.all([countIn(schema.job, organizationId), countIn(schema.candidate, organizationId), countIn(schema.auditLog, organizationId)]);
    const result = await seed(organizationId);
    expect(result.outcome).toBe('nothing_to_do');
    expect(await Promise.all([countIn(schema.job, organizationId), countIn(schema.candidate, organizationId), countIn(schema.auditLog, organizationId)])).toEqual(before);
  });

  it('touches only the organization it is given', async () => {
    const other = await new TestUser(t.app, uniqueEmail('other'), 'Other').signUp();
    await other.createOrganization('Altra');
    const [org] = await t.handle.db.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.slug, other.organizationSlug));
    expect(await countIn(schema.application, org!.id)).toBe(0);
    expect((await other.get<unknown[]>('/api/v1/jobs')).body.data).toEqual([]);
  });

  it('stops before writing when a candidate of the organization already uses a demo address', async () => {
    const other = await new TestUser(t.app, uniqueEmail('collide'), 'Collide').signUp();
    await other.createOrganization('Collisione');
    const [org] = await t.handle.db.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.slug, other.organizationSlug));
    const [demoCandidate] = await t.handle.db.select().from(schema.candidate).where(eq(schema.candidate.organizationId, organizationId)).limit(1);
    await t.handle.db.insert(schema.candidate).values({ id: randomUUID(), organizationId: org!.id, firstName: 'X', lastName: 'Y', email: demoCandidate!.email.toUpperCase(), retentionExpiresAt: NOW });
    await expect(seed(other.organizationSlug)).rejects.toBeInstanceOf(DemoSeedError);
    expect(await countIn(schema.job, org!.id)).toBe(0);
  });

  it('refuses an organization that does not exist', async () => {
    await expect(seed('no-such-organization')).rejects.toThrow(/No organization/);
  });
});
