import { DAY_MS, MIGRATION_PURGE_DAYS, migrationFetchFileKey, migrationFilePrefix, migrationPackageKey, migrationUploadKey, type MigrationBatch, type MigrationStatus } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../errors.js';
import { ORG_A, seedMigrationWorld } from '../../testing/index.js';
import { purgeEndedMigrations } from './purge-ended-migrations.js';

const NOW = new Date('2026-06-20T03:00:00Z');
const OLD = new Date(NOW.getTime() - (MIGRATION_PURGE_DAYS + 1) * DAY_MS);
const RECENT = new Date(NOW.getTime() - (MIGRATION_PURGE_DAYS - 1) * DAY_MS);

const batch = (id: string, status: MigrationStatus, updatedAt: Date, purgedAt: Date | null = null): MigrationBatch => ({
  id,
  organizationId: ORG_A,
  status,
  sourceSystem: 'teamtailor',
  producer: 'p',
  connectorMaturity: 'package',
  createdBy: 'user_owner',
  counts: { jobs: 1 },
  stageMapping: [],
  excludedJobs: [],
  declarations: null,
  packageKey: migrationPackageKey(ORG_A, id),
  error: null,
  createdAt: OLD,
  updatedAt,
  committedAt: null,
  undoneAt: null,
  purgedAt,
  groupId: null,
  part: null,
});

const issue = (batchId: string) => ({ id: `i_${batchId}`, organizationId: ORG_A, batchId, level: 'info' as const, code: 'merge_existing' as const, ref: 'c1', detail: null });

function world() {
  const batches = [batch('done_old', 'done', OLD), batch('failed_old', 'failed', OLD), batch('undone_old', 'undone', OLD), batch('done_recent', 'done', RECENT), batch('ready_old', 'ready', OLD), batch('purged', 'done', OLD, OLD)];
  const deps = seedMigrationWorld({ batches, issues: batches.map((b) => issue(b.id)) });
  for (const b of batches) void deps.files.put(b.packageKey, new Uint8Array([1]), 'application/zip');
  return deps;
}

describe('purgeEndedMigrations', () => {
  it('deletes the package and the issues of batches ended more than the purge window ago, once, keeping the rows and counts', async () => {
    const deps = world();
    expect(await purgeEndedMigrations(deps, { now: NOW })).toEqual({ purged: 3, failed: [] });
    const left = deps.files.keys().map((key) => key.split('/')[3]);
    expect(left.toSorted()).toEqual(['done_recent', 'purged', 'ready_old']);
    expect(deps.migrationStore.read().issues.map((i) => i.batchId).toSorted()).toEqual(['done_recent', 'purged', 'ready_old']);
    const purged = await deps.migrations.findById(ORG_A, 'failed_old');
    expect(purged).toMatchObject({ status: 'failed', purgedAt: NOW, counts: { jobs: 1 } });
    expect(await purgeEndedMigrations(deps, { now: NOW })).toEqual({ purged: 0, failed: [] });
  });

  it('reports a batch whose purge failed and tries it again on the next run; a file it cannot delete is queued', async () => {
    const deps = world();
    let fail = true;
    const flaky = {
      ...deps,
      migrationIssues: { ...deps.migrationIssues, deleteByBatch: async (o: string, b: string) => (fail && b === 'done_old' ? Promise.reject(new Error('db down')) : deps.migrationIssues.deleteByBatch(o, b)) },
      files: { ...deps.files, delete: async (key: string) => (key.includes('undone_old') ? Promise.reject(new Error('s3 down')) : deps.files.delete(key)) },
    };
    expect(await purgeEndedMigrations(flaky, { now: NOW })).toEqual({ purged: 2, failed: [{ organizationId: ORG_A, batchId: 'done_old' }] });
    expect(deps.queue.jobs()).toContainEqual({ name: 'files.delete', payload: { organizationId: ORG_A, key: migrationPackageKey(ORG_A, 'undone_old') } });
    fail = false;
    expect(await purgeEndedMigrations(flaky, { now: NOW })).toEqual({ purged: 1, failed: [] });
  });

  it('leaves a batch that changed under it for a later run', async () => {
    const deps = world();
    const racing = { ...deps, migrations: { ...deps.migrations, transition: async () => Promise.reject(new ConflictError('migration_changed')) } };
    expect(await purgeEndedMigrations(racing, { now: NOW, limit: 1 })).toEqual({ purged: 0, failed: [] });
  });

  it('deletes the temporary files a crashed connector fetch reserved, as recorded on the batch', async () => {
    const crashed = { ...batch('fetch_crashed', 'failed', OLD), connectorMaturity: 'beta' as const, counts: { fetch: { done: 3, total: null, reservedFiles: 3 } } };
    const deps = seedMigrationWorld({ batches: [crashed] });
    const prefix = migrationFilePrefix(ORG_A, crashed.id);
    for (const slot of [0, 1]) await deps.files.put(migrationFetchFileKey(prefix, slot), new Uint8Array([1]), 'application/pdf');
    expect(await purgeEndedMigrations(deps, { now: NOW })).toEqual({ purged: 1, failed: [] });
    expect(deps.files.keys()).toEqual([]);
  });

  it('deletes the uploaded files of a file-based connector that died before it could', async () => {
    const dead = { ...batch('upload_left', 'failed', OLD), connectorMaturity: 'beta' as const, counts: { fetch: { done: 0, total: null, upload: { cvs: true } } } };
    const deps = seedMigrationWorld({ batches: [dead] });
    for (const name of ['sheet', 'cvs'] as const) await deps.files.put(migrationUploadKey(ORG_A, dead.id, name), new Uint8Array([1]), 'text/csv');
    expect(await purgeEndedMigrations(deps, { now: NOW })).toEqual({ purged: 1, failed: [] });
    expect(deps.files.keys()).toEqual([]);
  });
});
