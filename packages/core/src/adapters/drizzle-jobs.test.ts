import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import { buildJob, buildJobTemplate, completeJobContent, fixedQualityReport } from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleJobTemplates } from './drizzle-job-templates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleOrganizationDirectory } from './drizzle-organizations.js';

let handle: DbHandle;
let orgA: string;
let orgB: string;
let slugA: string;

const insertOrg = async (logo: string | null = null): Promise<{ id: string; slug: string }> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: `Name ${id}`, slug: id, logo, createdAt: new Date() });
  return { id, slug: id };
};
const newJob = (organizationId: string, overrides = {}) => buildJob({ id: randomUUID(), slug: randomUUID(), organizationId, ...overrides });

beforeAll(async () => {
  handle = createDb(coreTestDatabaseUrl(), 2);
  const a = await insertOrg('https://x/logo.png');
  orgA = a.id;
  slugA = a.slug;
  orgB = (await insertOrg()).id;
});
afterAll(async () => {
  await handle.close();
});

describe('createDrizzleJobs', () => {
  it('creates and reads back a job, parsing jsonb', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const input = newJob(orgA, { quality: fixedQualityReport(), publishedAt: new Date('2026-03-01T00:00:00Z') });
    const created = await jobs.create(input);
    expect(created).toEqual(input);
    expect(await jobs.findById(orgA, input.id)).toEqual(input);
  });

  it('throws ConflictError on a duplicate slug but allows it in another organization', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const first = newJob(orgA);
    await jobs.create(first);
    await expect(jobs.create(newJob(orgA, { slug: first.slug }))).rejects.toBeInstanceOf(ConflictError);
    await expect(jobs.create(newJob(orgB, { slug: first.slug }))).resolves.toBeDefined();
  });

  it('propagates other insert errors', async () => {
    const jobs = createDrizzleJobs(handle.db);
    await expect(jobs.create(newJob('missing-org'))).rejects.toThrow();
  });

  it('isolates organizations in every read', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const mine = newJob(orgA, { status: 'published', publishedAt: new Date() });
    await jobs.create(mine);
    expect(await jobs.findById(orgB, mine.id)).toBeNull();
    expect(await jobs.findPublishedBySlug(orgB, mine.slug)).toBeNull();
    expect((await jobs.listPublished(orgB)).map((j) => j.id)).not.toContain(mine.id);
    expect((await jobs.list({ organizationId: orgB, page: 1, limit: 100 })).items.map((j) => j.id)).not.toContain(mine.id);
  });

  it('does not save across organizations', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const mine = newJob(orgA);
    await jobs.create(mine);
    await expect(jobs.save({ ...mine, organizationId: orgB, content: completeJobContent({ title: 'Hijack' }) })).rejects.toThrow();
    expect((await jobs.findById(orgA, mine.id))?.content.title).toBe('Backend Developer');
  });

  it('saves a full replacement and keeps the title column in sync', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const mine = newJob(orgA);
    await jobs.create(mine);
    const saved = await jobs.save({ ...mine, status: 'closed', closedAt: new Date(), content: completeJobContent({ title: 'Renamed' }) });
    expect(saved).toMatchObject({ status: 'closed', content: { title: 'Renamed' } });
    const { rows } = await handle.pool.query('select title from job where id = $1', [mine.id]);
    expect(rows[0]?.title).toBe('Renamed');
  });

  it('lists newest updatedAt first, filtered and paginated', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const org = (await insertOrg()).id;
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    await jobs.create(newJob(org, { id: 'l1', updatedAt: day(1) }));
    await jobs.create(newJob(org, { id: 'l2', updatedAt: day(3), status: 'published', publishedAt: day(3) }));
    await jobs.create(newJob(org, { id: 'l3', updatedAt: day(2) }));
    expect((await jobs.list({ organizationId: org, page: 1, limit: 10 })).items.map((j) => j.id)).toEqual(['l2', 'l3', 'l1']);
    const page = await jobs.list({ organizationId: org, page: 2, limit: 2 });
    expect(page).toMatchObject({ total: 3 });
    expect(page.items.map((j) => j.id)).toEqual(['l1']);
    const published = await jobs.list({ organizationId: org, status: 'published', page: 1, limit: 10 });
    expect(published.items.map((j) => j.id)).toEqual(['l2']);
  });

  it('lists only published jobs, newest publishedAt first, and finds only published by slug', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const org = (await insertOrg()).id;
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    await jobs.create(newJob(org, { id: 'p1', slug: 'p1', status: 'published', publishedAt: day(1) }));
    await jobs.create(newJob(org, { id: 'p2', slug: 'p2', status: 'published', publishedAt: day(5) }));
    await jobs.create(newJob(org, { id: 'd1', slug: 'd1' }));
    await jobs.create(newJob(org, { id: 'c1', slug: 'c1', status: 'closed', publishedAt: day(2), closedAt: day(3) }));
    expect((await jobs.listPublished(org)).map((j) => j.id)).toEqual(['p2', 'p1']);
    expect((await jobs.findPublishedBySlug(org, 'p1'))?.id).toBe('p1');
    expect(await jobs.findPublishedBySlug(org, 'd1')).toBeNull();
    expect(await jobs.findPublishedBySlug(org, 'c1')).toBeNull();
  });

  it('rejects corrupted jsonb on read', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const id = randomUUID();
    await handle.db.insert(schema.job).values({ id, organizationId: orgA, slug: id, title: 'x', content: { nope: true } as never, createdBy: 'u' });
    await expect(jobs.findById(orgA, id)).rejects.toThrow();
  });
});

describe('createDrizzleJobTemplates', () => {
  it('creates, lists, finds and deletes within the organization only', async () => {
    const templates = createDrizzleJobTemplates(handle.db);
    const t = buildJobTemplate({ id: randomUUID(), organizationId: orgA });
    expect(await templates.create(t)).toEqual(t);
    expect(await templates.findById(orgA, t.id)).toEqual(t);
    expect((await templates.list(orgA)).map((x) => x.id)).toContain(t.id);
    expect(await templates.findById(orgB, t.id)).toBeNull();
    expect((await templates.list(orgB)).map((x) => x.id)).not.toContain(t.id);
    expect(await templates.delete(orgB, t.id)).toBe(false);
    expect(await templates.findById(orgA, t.id)).not.toBeNull();
    expect(await templates.delete(orgA, t.id)).toBe(true);
    expect(await templates.delete(orgA, t.id)).toBe(false);
  });
});

describe('createDrizzleOrganizationDirectory', () => {
  it('finds an organization by slug with only the public fields', async () => {
    const directory = createDrizzleOrganizationDirectory(handle.db);
    const found = await directory.findBySlug(slugA);
    expect(found).toEqual({ id: orgA, name: `Name ${orgA}`, slug: slugA, logo: 'https://x/logo.png' });
    expect(await directory.findBySlug('does-not-exist')).toBeNull();
  });
});
