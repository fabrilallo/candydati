import { MIGRATION_ISSUE_LEVELS, type MigrationBatch, type MigrationIssue } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import type { MigrationBatchRepository, MigrationIssueRepository, MigrationPackageOpenResult, MigrationPackageReader } from '../migration-ports.js';
import { cell } from './in-memory-transaction.js';

export interface MigrationStoreState {
  readonly batches: readonly MigrationBatch[];
  readonly issues: readonly MigrationIssue[];
}

export interface MigrationStore {
  read(): MigrationStoreState;
  write(next: Partial<MigrationStoreState>): void;
}

export const createMigrationStore = (initial: Partial<MigrationStoreState> = {}): MigrationStore => {
  const state = cell<MigrationStoreState>({ batches: [], issues: [], ...initial });
  return {
    read: () => state.get(),
    write: (next) => {
      state.set({ ...state.get(), ...next });
    },
  };
};

export function createInMemoryMigrationBatches(store: MigrationStore): MigrationBatchRepository {
  const find = (organizationId: string, id: string) => store.read().batches.find((b) => b.organizationId === organizationId && b.id === id) ?? null;
  return {
    async create(batch) {
      store.write({ batches: [...store.read().batches, batch] });
      return batch;
    },
    async transition(organizationId, id, from, patch) {
      const current = find(organizationId, id);
      if (!current || current.status !== from) throw new ConflictError('migration_changed');
      const next = { ...current, ...patch };
      store.write({ batches: store.read().batches.map((b) => (b === current ? next : b)) });
      return next;
    },
    async findById(organizationId, id) {
      return find(organizationId, id);
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
