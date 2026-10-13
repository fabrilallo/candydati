import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { job, jobTemplate, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

const url = testDatabaseUrl();
let handle: DbHandle;

const content = { title: 'Backend Developer' } as never;

const insertOrg = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};

const insertJob = (organizationId: string, slug: string) =>
  handle.db.insert(job).values({ id: randomUUID(), organizationId, slug, title: 'T', content, createdBy: 'u1' });

describe('job and job_template tables', () => {
  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('creates both tables', async () => {
    const { rows } = await handle.pool.query(`select table_name from information_schema.tables where table_schema = 'public'`);
    const names = rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(['job', 'job_template']));
  });

  it('applies defaults to a new job', async () => {
    const org = await insertOrg();
    const id = randomUUID();
    await handle.db.insert(job).values({ id, organizationId: org, slug: 's', title: 'T', content, createdBy: 'u1' });
    const [row] = await handle.db.select().from(job).where(eq(job.id, id));
    expect(row).toMatchObject({ status: 'draft', quality: null, publishedAt: null, closedAt: null });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate slug inside one organization', async () => {
    const org = await insertOrg();
    await insertJob(org, 'same');
    await expect(insertJob(org, 'same')).rejects.toThrow();
  });

  it('allows the same slug in two organizations', async () => {
    const a = await insertOrg();
    const b = await insertOrg();
    await insertJob(a, 'same');
    await expect(insertJob(b, 'same')).resolves.toBeDefined();
  });

  it('refuses to delete an organization that has jobs or templates', async () => {
    const org = await insertOrg();
    await insertJob(org, 'x');
    await expect(handle.pool.query('delete from organization where id = $1', [org])).rejects.toThrow();
    const other = await insertOrg();
    await handle.db.insert(jobTemplate).values({ id: randomUUID(), organizationId: other, name: 'n', content, createdBy: 'u1' });
    await expect(handle.pool.query('delete from organization where id = $1', [other])).rejects.toThrow();
  });

  it('rejects a job for a missing organization', async () => {
    await expect(insertJob('missing', 's')).rejects.toThrow();
  });
});
