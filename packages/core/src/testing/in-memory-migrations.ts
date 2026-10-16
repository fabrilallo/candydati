import { isMigrationEnded, MIGRATION_ISSUE_LEVELS, type MigrationBatch, type MigrationIssue } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import type { MigrationBatchRepository, MigrationIssueRepository, MigrationPackageOpenResult, MigrationPackageReader } from '../migration-ports.js';
import { cell } from './in-memory-transaction.js';

/** Which batch wrote a row the domain types do not carry the batch of (job, candidate, note, message, stage event). */
export interface MigratedRowTag {
  readonly kind: 'job' | 'candidate' | 'note' | 'message' | 'stage_event';
  readonly id: string;
  readonly batchId: string;
}

/** Sealed connector credentials, kept apart from the batch like the Postgres column the batch reads never select. */
export interface StoredCredentials {
  readonly organizationId: string;
  readonly batchId: string;
  readonly ciphertext: string;
}

export interface MigrationStoreState {
  readonly batches: readonly MigrationBatch[];
  readonly issues: readonly MigrationIssue[];
  readonly tags: readonly MigratedRowTag[];
  readonly credentials: readonly StoredCredentials[];
}

export interface MigrationStore {
  read(): MigrationStoreState;
  write(next: Partial<MigrationStoreState>): void;
}

export const createMigrationStore = (initial: Partial<MigrationStoreState> = {}): MigrationStore => {
  const state = cell<MigrationStoreState>({ batches: [], issues: [], tags: [], credentials: [], ...initial });
  return {
    read: () => state.get(),
    write: (next) => {
      state.set({ ...state.get(), ...next });
    },
  };
};

export function createInMemoryMigrationBatches(store: MigrationStore): MigrationBatchRepository {
  const find = (organizationId: string, id: string) => store.read().batches.find((b) => b.organizationId === organizationId && b.id === id) ?? null;
  const ofBatch = (organizationId: string, id: string) => (c: StoredCredentials) => c.organizationId === organizationId && c.batchId === id;
  const wipe = (organizationId: string, id: string): void => {
    store.write({ credentials: store.read().credentials.filter((c) => !ofBatch(organizationId, id)(c)) });
  };
  return {
    async create(batch, secrets) {
      const credentials = secrets === undefined ? [] : [{ organizationId: batch.organizationId, batchId: batch.id, ciphertext: secrets.credentialsCiphertext }];
      store.write({ batches: [...store.read().batches, batch], credentials: [...store.read().credentials, ...credentials] });
      return batch;
    },
    async transition(organizationId, id, from, patch) {
      const current = find(organizationId, id);
      if (!current || current.status !== from) throw new ConflictError('migration_changed');
      const next = { ...current, ...patch };
      store.write({ batches: store.read().batches.map((b) => (b === current ? next : b)) });
      // Like Postgres: any change to an ended status wipes the credentials in the same write.
      if (patch.status !== undefined && isMigrationEnded(patch.status)) wipe(organizationId, id);
      return next;
    },
    async readCredentials(organizationId, id) {
      return store.read().credentials.find(ofBatch(organizationId, id))?.ciphertext ?? null;
    },
    async wipeCredentials(organizationId, id) {
      wipe(organizationId, id);
    },
    async findById(organizationId, id) {
      return find(organizationId, id);
    },
    async lock(organizationId, id) {
      return find(organizationId, id);
    },
    async listToPurge(before, limit) {
      return store
        .read()
        .batches.filter((b) => isMigrationEnded(b.status) && b.updatedAt < before && b.purgedAt === null)
        .toSorted((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async list(organizationId) {
      return store
        .read()
        .batches.filter((b) => b.organizationId === organizationId)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    },
  };
}

const rank = (issue: MigrationIssue): number => MIGRATION_ISSUE_LEVELS.indexOf(issue.level);
const byPreviewOrder = (a: MigrationIssue, b: MigrationIssue): number =>
  rank(a) - rank(b) || a.code.localeCompare(b.code) || (a.ref ?? '').localeCompare(b.ref ?? '') || a.id.localeCompare(b.id);

export function createInMemoryMigrationIssues(store: MigrationStore): MigrationIssueRepository {
  const inBatch = (organizationId: string, batchId: string) => (i: MigrationIssue) => i.organizationId === organizationId && i.batchId === batchId;
  return {
    async replaceAll(organizationId, batchId, issues) {
      const others = store.read().issues.filter((i) => !inBatch(organizationId, batchId)(i));
      store.write({ issues: [...others, ...issues.map((issue) => ({ ...issue, organizationId, batchId }))] });
    },
    async list(query) {
      const all = store
        .read()
        .issues.filter(inBatch(query.organizationId, query.batchId))
        .filter((i) => query.level === undefined || i.level === query.level)
        .toSorted(byPreviewOrder);
      const start = (query.page - 1) * query.limit;
      return { items: all.slice(start, start + query.limit), total: all.length };
    },
    async deleteByBatch(organizationId, batchId) {
      store.write({ issues: store.read().issues.filter((i) => !inBatch(organizationId, batchId)(i)) });
    },
  };
}

export interface FakeMigrationPackageReader extends MigrationPackageReader {
  /** What `open(key)` answers; an unregistered key is refused as `invalid_archive`. */
  register(key: string, result: MigrationPackageOpenResult | Error): void;
}

export function createFakeMigrationPackageReader(): FakeMigrationPackageReader {
  let results: ReadonlyMap<string, MigrationPackageOpenResult | Error> = new Map();
  return {
    register(key, result) {
      results = new Map([...results, [key, result]]);
    },
    async open(key) {
      const result = results.get(key) ?? { ok: false, code: 'invalid_archive', details: [] };
      if (result instanceof Error) throw result;
      return result;
    },
  };
}
