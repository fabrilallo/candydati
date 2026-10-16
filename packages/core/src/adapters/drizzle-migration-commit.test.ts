import { createHash, randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { migrationPackageKey } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildApplication,
  buildCandidate,
  buildJob,
  buildPrivacyNotice,
  createFakeMigrationPackageReader,
  createInMemoryFileStorage,
  createInMemoryTaskQueue,
  fakeCvSniffer,
  testMessagingConfig,
  userActor,
} from '../testing/index.js';
import { COMMIT_CHOICES, COMMIT_FILES, COMMIT_PACKAGE, DECLARATIONS } from '../testing/migration-commit-fixtures.js';
import { openedPackage, zipBytes } from '../testing/migration-fixtures.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { answerConsentRequest } from '../use-cases/imports/consent-request.js';
import { analyzeMigration } from '../use-cases/migrations/analyze-migration.js';
import { updateMigrationChoices } from '../use-cases/migrations/choices.js';
import { commitMigration } from '../use-cases/migrations/commit-migration.js';
import { createMigrationFromPackage } from '../use-cases/migrations/create-migration.js';
import { requestMigrationCommit } from '../use-cases/migrations/request-commit.js';
import { undoMigration } from '../use-cases/migrations/undo-migration.js';
import { createDrizzleUnitOfWork } from './drizzle-repositories.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T10:00:00.000Z');
const TABLES = ['job', 'candidate', 'application', 'candidate_note', 'message', 'conversation', 'application_stage_event', 'cv_extraction', 'consent_token', 'response_promise'] as const;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

/** An organization with a notice, a published job and Ada, who applied to it before the migration. */
async function world() {
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: 'Acme', slug: org, createdAt: new Date() });
  const uow = createDrizzleUnitOfWork(handle.db);
  const r = uow.repositories;
  await r.privacyNotices.create(buildPrivacyNotice({ id: randomUUID(), organizationId: org }));
  const job = await r.jobs.create(buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org, status: 'published', publishedAt: NOW }));
  const ada = await r.candidates.create(buildCandidate({ id: randomUUID(), organizationId: org, email: 'ada@example.com' }));
  const cv = { key: `organizations/${org}/applications/before/cv`, fileName: 'cv.pdf', mediaType: 'application/pdf' as const, sizeBytes: 1 };
  await r.applications.create(buildApplication({ id: randomUUID(), organizationId: org, jobId: job.id, candidateId: ada.id, cv }));
  let secrets = 0;
  const deps = {
    transaction: uow.transaction,
    auditLog: r.auditLog,
    migrations: r.migrations,
    migrationIssues: r.migrationIssues,
    migratedRows: r.migratedRows,
    candidates: r.candidates,
    applications: r.applications,
    extractions: r.extractions,
    privacyNotices: r.privacyNotices,
    organizations: r.organizations,
    members: r.members,
    jobs: r.jobs,
    consentTokens: r.consentTokens,
    erasure: r.erasure,
    mail: { conversations: r.conversations, messages: r.messages, config: testMessagingConfig, newToken: () => randomUUID().replaceAll('-', '') },
    packages: createFakeMigrationPackageReader(),
    cvSniffer: fakeCvSniffer,
    files: createInMemoryFileStorage(),
    queue: createInMemoryTaskQueue(),
    newId: () => randomUUID(),
    newSecret: () => `migration-secret-${String((secrets += 1)).padStart(4, '0')}-${org}`,
    hash: (value: string) => createHash('sha256').update(value).digest('hex'),
    now: () => NOW,
  };
  return { org, deps, owner: userActor({ id: 'user_owner', organizationId: org, role: 'owner' }) };
}

type World = Awaited<ReturnType<typeof world>>;

/** Every row of the organization in the tables a migration touches, as text: what "as before" means. */
async function rowsOf(org: string): Promise<Record<string, readonly string[]>> {
  const entries = await Promise.all(
    TABLES.map(async (table) => {
      const { rows } = await handle.pool.query<{ r: string }>(`select row_to_json(t)::text as r from ${table} t where organization_id = $1 order by 1`, [org]);
      return [table, rows.map((row) => row.r)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function commit({ org, deps, owner }: World): Promise<string> {
  const created = await createMigrationFromPackage(deps, owner, { file: { fileName: 'export.zip', bytes: zipBytes() } });
  deps.packages.register(migrationPackageKey(org, created.id), openedPackage(COMMIT_PACKAGE, COMMIT_FILES()));
  expect(await analyzeMigration(deps, { organizationId: org, batchId: created.id })).toBe('ready');
  await updateMigrationChoices(deps, owner, { migrationId: created.id, ...COMMIT_CHOICES });
  await requestMigrationCommit(deps, owner, { migrationId: created.id, declarations: DECLARATIONS });
  expect(await commitMigration(deps, { organizationId: org, batchId: created.id })).toBe('done');
  return created.id;
}

describe('a migration committed and undone on Postgres', () => {
  it('writes the history with the batch id on every row, then the undo leaves the database as it was', async () => {
    const w = await world();
    const before = await rowsOf(w.org);
    const batchId = await commit(w);
    const after = await rowsOf(w.org);
    const tagged = (table: string) => after[table]?.filter((row) => row.includes(`"migration_batch_id":"${batchId}"`)) ?? [];
    expect(tagged('job').map((row) => JSON.parse(row) as { status: string; origin: string }).map((job) => [job.status, job.origin])).toEqual(
      expect.arrayContaining([
        ['closed', 'migration'],
        ['draft', 'migration'],
      ]),
    );
    expect(tagged('candidate')).toHaveLength(2);
    expect(tagged('application')).toHaveLength(4);
    expect(tagged('application').filter((row) => row.includes('"cv_key":null'))).toHaveLength(3);
    expect(tagged('application_stage_event').every((row) => row.includes('"backfilled":true') && row.includes('"actor_type":"system"'))).toBe(true);
    expect(tagged('application_stage_event')).toHaveLength(10);
    expect(tagged('candidate_note').filter((row) => row.includes('"author_id":null'))).toHaveLength(4);
    expect(tagged('message').every((row) => row.includes('"historical":true'))).toBe(true);
    expect(tagged('message')).toHaveLength(2);
    expect(after.consent_token).toHaveLength(1);
    const ada = after.candidate?.filter((row) => row.includes('ada@example.com'));
    expect(ada).toEqual(before.candidate?.filter((row) => row.includes('ada@example.com')));

    const undone = await undoMigration(w.deps, w.owner, { migrationId: batchId });
    expect(undone.counts).toMatchObject({ applicationsErased: 4, candidatesErased: 2, jobsDeleted: 2, failed: 0, historyDeleted: 1 });
    expect(await rowsOf(w.org)).toEqual(before);
    expect(w.deps.files.keys().filter((key) => key.includes('/applications/'))).toEqual([]);
    const [batch] = await handle.pool.query<{ status: string; counts: { commit: { applications: number } } }>('select status, counts from migration_batch where id = $1', [batchId]).then((q) => q.rows);
    expect(batch).toMatchObject({ status: 'undone', counts: { commit: { applications: 4 } } });
  });

  it('keeps a person who reconfirmed, with every application the migration brought them and the jobs that hold them', async () => {
    const w = await world();
    const before = await rowsOf(w.org);
    const batchId = await commit(w);
    expect(await answerConsentRequest(w.deps, { token: `migration-secret-0001-${w.org}`, scopes: ['selection'] })).toEqual({ status: 'reconfirmed' });
    const carla = (await w.deps.candidates.findByEmail(w.org, 'carla@example.com'))!;
    const kept = await w.deps.applications.listByCandidate(w.org, carla.id);
    expect(kept.map((a) => a.consentStatus)).toEqual(['given', 'given']);
    const undone = await undoMigration(w.deps, w.owner, { migrationId: batchId });
    expect(undone.counts).toMatchObject({ keptReconfirmed: 1, candidatesErased: 1, applicationsErased: 2, jobsDeleted: 0, jobsKept: 2 });
    const keptIds = [carla.id, ...kept.map((a) => a.id), ...new Set(kept.map((a) => a.jobId))];
    const others = Object.fromEntries(Object.entries(await rowsOf(w.org)).map(([table, rows]) => [table, rows.filter((row) => !keptIds.some((id) => row.includes(id)))]));
    expect(others).toEqual(before);
    expect(await w.deps.applications.listByCandidate(w.org, carla.id)).toHaveLength(2);
  });
});
