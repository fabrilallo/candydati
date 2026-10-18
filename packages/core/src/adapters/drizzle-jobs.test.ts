import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
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

  it('does not write across organizations', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const mine = newJob(orgA);
    await jobs.create(mine);
    await expect(jobs.updateContent(orgB, mine.id, 'draft', { content: completeJobContent({ title: 'Hijack' }), updatedAt: new Date() })).rejects.toBeInstanceOf(ConflictError);
    await expect(jobs.transition(orgB, mine.id, 'draft', { status: 'published', quality: null, publishedAt: new Date(), updatedAt: new Date() })).rejects.toBeInstanceOf(ConflictError);
    expect(await jobs.findById(orgA, mine.id)).toMatchObject({ status: 'draft', content: { title: 'Backend Developer' } });
  });

  it('updates the content and the title column, never the status, and only in the expected status (#4)', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const mine = newJob(orgA, { status: 'published', publishedAt: new Date() });
    await jobs.create(mine);
    const saved = await jobs.updateContent(orgA, mine.id, 'published', { content: completeJobContent({ title: 'Renamed' }), updatedAt: new Date() });
    expect(saved).toMatchObject({ status: 'published', content: { title: 'Renamed' } });
    const { rows } = await handle.pool.query('select title from job where id = $1', [mine.id]);
    expect(rows[0]?.title).toBe('Renamed');
    await jobs.transition(orgA, mine.id, 'published', { status: 'closed', closedAt: new Date(), updatedAt: new Date() });
    // An edit read while published arrives after the close: refused, the job stays closed.
    await expect(jobs.updateContent(orgA, mine.id, 'published', { content: completeJobContent({ title: 'Late' }), updatedAt: new Date() })).rejects.toBeInstanceOf(ConflictError);
    await expect(jobs.transition(orgA, mine.id, 'published', { status: 'closed', closedAt: new Date(), updatedAt: new Date() })).rejects.toBeInstanceOf(ConflictError);
    expect(await jobs.findById(orgA, mine.id)).toMatchObject({ status: 'closed', content: { title: 'Renamed' } });
  });

  it('locks the row inside a transaction and reads it outside one', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const mine = newJob(orgA);
    await jobs.create(mine);
    expect(await jobs.lock(orgA, mine.id, 'share')).toMatchObject({ id: mine.id });
    expect(await jobs.lock(orgB, mine.id, 'update')).toBeNull();
    const locked = await handle.db.transaction((tx) => createDrizzleJobs(tx).lock(orgA, mine.id, 'update'));
    expect(locked?.id).toBe(mine.id);
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

describe('createDrizzleJobs aggregates', () => {
  const ts = (iso: string) => new Date(iso);

  it('counts per status, zero for missing statuses, isolated per organization', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const org = (await insertOrg()).id;
    const other = (await insertOrg()).id;
    await jobs.create(newJob(org));
    await jobs.create(newJob(org));
    await jobs.create(newJob(org, { status: 'published', publishedAt: new Date() }));
    await jobs.create(newJob(other, { status: 'closed', publishedAt: new Date(), closedAt: new Date() }));
    expect(await jobs.countByStatus(org)).toEqual({ draft: 2, published: 1, closed: 0 });
    expect(await jobs.countByStatus(other)).toEqual({ draft: 0, published: 0, closed: 1 });
    expect(await jobs.countByStatus((await insertOrg()).id)).toEqual({ draft: 0, published: 0, closed: 0 });
  });

  it('buckets created and published per UTC week starting Monday, from since on, isolated', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const org = (await insertOrg()).id;
    const other = (await insertOrg()).id;
    await jobs.create(newJob(org, { createdAt: ts('2026-05-31T23:59:59.999Z') })); // Sunday
    await jobs.create(newJob(org, { createdAt: ts('2026-06-01T00:00:00.000Z') })); // Monday
    await jobs.create(newJob(org, { createdAt: ts('2026-05-17T12:00:00.000Z') })); // before since
    await jobs.create(newJob(org, { createdAt: ts('2026-05-26T00:00:00Z'), status: 'published', publishedAt: ts('2026-06-02T08:00:00Z') }));
    await jobs.create(
      newJob(org, { createdAt: ts('2026-05-26T00:00:00Z'), status: 'closed', publishedAt: ts('2026-06-07T23:00:00Z'), closedAt: ts('2026-06-08T00:00:00Z') }),
    );
    await jobs.create(newJob(other, { createdAt: ts('2026-06-01T10:00:00Z'), status: 'published', publishedAt: ts('2026-06-01T10:00:00Z') }));
    expect(await jobs.weeklyActivity(org, ts('2026-05-25T00:00:00Z'))).toEqual({
      created: [
        { week: '2026-05-25', count: 3 },
        { week: '2026-06-01', count: 1 },
      ],
      published: [{ week: '2026-06-01', count: 2 }],
    });
  });

  it('lists every job of one status, newest updatedAt first, isolated', async () => {
    const jobs = createDrizzleJobs(handle.db);
    const org = (await insertOrg()).id;
    const other = (await insertOrg()).id;
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    await jobs.create(newJob(org, { id: randomUUID(), updatedAt: day(1) }));
    const newest = await jobs.create(newJob(org, { updatedAt: day(4) }));
    const oldest = (await jobs.listByStatus(org, 'draft')).at(-1)!;
    await jobs.create(newJob(org, { status: 'published', publishedAt: day(2) }));
    await jobs.create(newJob(other));
    const drafts = await jobs.listByStatus(org, 'draft');
    expect(drafts.map((j) => j.id)).toEqual([newest.id, oldest.id]);
    expect(drafts[0]).toEqual(newest);
    expect(await jobs.listByStatus(org, 'closed')).toEqual([]);
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
    expect(found).toEqual({ id: orgA, name: `Name ${orgA}`, slug: slugA, logo: 'https://x/logo.png', logoFile: null });
    expect(await directory.findBySlug('does-not-exist')).toBeNull();
  });
});
