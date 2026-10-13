import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('migration 0005_job_stage_ids', () => {
  const sqlFile = join(dirname(fileURLToPath(import.meta.url)), '../drizzle/0005_job_stage_ids.sql');
  const stage = (type: string, extra: object = {}) => ({ type, durationMinutes: 30, conductedBy: 'recruiter', ...extra });
  let migration: readonly string[];

  const processOf = async (table: 'job' | 'job_template', id: string): Promise<unknown> => {
    const { rows } = await handle.pool.query(`select content -> 'process' as process from ${table} where id = $1`, [id]);
    return rows[0]?.process;
  };

  beforeAll(async () => {
    await runMigrations(url);
    handle = createDb(url);
    migration = readFileSync(sqlFile, 'utf8').split('--> statement-breakpoint');
  });
  afterAll(async () => {
    await handle.close();
  });

  const runMigration = async () => {
    for (const statement of migration) await handle.pool.query(statement);
  };

  it('writes stage-<index> into stages without id, in jobs and templates, and keeps existing ids', async () => {
    const org = await insertOrg();
    const jobId = randomUUID();
    const templateId = randomUUID();
    const process = [stage('screening_call'), stage('hr_interview', { id: 'stg-keep' }), stage('offer', { note: 'x' })];
    await handle.db.insert(job).values({ id: jobId, organizationId: org, slug: 'm', title: 'T', content: { title: 'T', process } as never, createdBy: 'u1' });
    await handle.db.insert(jobTemplate).values({ id: templateId, organizationId: org, name: 'n', content: { title: 'T', process } as never, createdBy: 'u1' });

    await runMigration();

    const expected = [
      { ...process[0], id: 'stage-0' },
      { ...process[1], id: 'stg-keep' },
      { ...process[2], id: 'stage-2' },
    ];
    expect(await processOf('job', jobId)).toEqual(expected);
    expect(await processOf('job_template', templateId)).toEqual(expected);
  });

  it('is idempotent and leaves contents without a process untouched', async () => {
    const org = await insertOrg();
    const bare = randomUUID();
    const empty = randomUUID();
    await handle.db.insert(job).values({ id: bare, organizationId: org, slug: 'b', title: 'T', content: { title: 'T' } as never, createdBy: 'u1' });
    await handle.db.insert(job).values({ id: empty, organizationId: org, slug: 'e', title: 'T', content: { title: 'T', process: [] } as never, createdBy: 'u1' });
    await runMigration();
    await runMigration();
    expect(await processOf('job', bare)).toBeNull();
    expect(await processOf('job', empty)).toEqual([]);
  });
});
