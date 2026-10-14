import type { ImportAnalysis, ImportBatch, ImportItem } from '@tt/domain';
import type {
  ConsentToken,
  ConsentTokenRepository,
  ImportAnalysisRepository,
  ImportBatchRepository,
  ImportCommitTransaction,
  ImportItemRepository,
} from '../import-ports.js';
import type { CandidateStore } from './in-memory-candidates.js';
import type { JobRepository } from '../job-ports.js';
import { ConflictError } from '../errors.js';
import {
  createInMemoryApplicationRepository,
  createInMemoryCandidateNoteRepository,
  createInMemoryCandidateRepository,
  createInMemoryCvExtractionRepository,
} from './in-memory-candidates.js';
import { createInMemoryStageEvents } from './in-memory-reports.js';
import { cell } from './in-memory-transaction.js';

export interface ImportStoreState {
  readonly batches: readonly ImportBatch[];
  readonly items: readonly ImportItem[];
  readonly analyses: readonly ImportAnalysis[];
  readonly tokens: readonly ConsentToken[];
}

export interface ImportStore {
  read(): ImportStoreState;
  write(next: Partial<ImportStoreState>): void;
}

export const createImportStore = (initial: Partial<ImportStoreState> = {}): ImportStore => {
  const state = cell<ImportStoreState>({ batches: [], items: [], analyses: [], tokens: [], ...initial });
  return { read: () => state.get(), write: (next) => { state.set({ ...state.get(), ...next }); } };
};

export function createInMemoryImportBatches(store: ImportStore): ImportBatchRepository {
  const inOrg = (organizationId: string) => store.read().batches.filter((b) => b.organizationId === organizationId);
  const replace = (batch: ImportBatch): ImportBatch => {
    store.write({ batches: store.read().batches.map((b) => (b.organizationId === batch.organizationId && b.id === batch.id ? batch : b)) });
    return batch;
  };
  return {
    async create(batch) {
      store.write({ batches: [...store.read().batches, batch] });
      return batch;
    },
    async save(batch) {
      return replace(batch);
    },
    async transition(organizationId, id, from, patch) {
      const current = inOrg(organizationId).find((b) => b.id === id);
      if (!current || current.status !== from) throw new ConflictError(`import_${current?.status ?? 'missing'}`);
      return replace({ ...current, ...patch });
    },
    async addCounts(organizationId, id, delta) {
      const current = inOrg(organizationId).find((b) => b.id === id);
      if (!current) return;
      const counts = Object.fromEntries(Object.entries(delta).map(([key, value]) => [key, current.counts[key as keyof typeof delta] + (value ?? 0)]));
      replace({ ...current, counts: { ...current.counts, ...counts } });
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((b) => b.id === id) ?? null;
    },
    async lock(organizationId, id) {
      return inOrg(organizationId).find((b) => b.id === id) ?? null;
    },
    async list(organizationId) {
      return inOrg(organizationId).toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listStale(before) {
      const open: readonly ImportBatch['status'][] = ['uploaded', 'analyzing', 'ready', 'importing'];
      return store.read().batches.filter((b) => b.createdAt < before && (open.includes(b.status) || b.sourceFiles.length > 0));
    },
  };
}

export function createInMemoryImportItems(store: ImportStore): ImportItemRepository {
  const inBatch = (organizationId: string, batchId: string) => store.read().items.filter((i) => i.organizationId === organizationId && i.batchId === batchId).toSorted((a, b) => a.position - b.position);
  const without = (organizationId: string, batchId: string) => store.read().items.filter((i) => !(i.organizationId === organizationId && i.batchId === batchId));
  return {
    async replaceAll(organizationId, batchId, items) {
      store.write({ items: [...without(organizationId, batchId), ...items] });
    },
    async list(query) {
      const all = inBatch(query.organizationId, query.batchId).filter((i) => query.confidence === undefined || i.proposal.confidence === query.confidence);
      const start = (query.page - 1) * query.limit;
      return { items: all.slice(start, start + query.limit), total: all.length };
    },
    async listAll(organizationId, batchId) {
      return inBatch(organizationId, batchId);
    },
    async setIncluded(organizationId, batchId, changes) {
      const byId = new Map(changes.map((c) => [c.itemId, c.included]));
      store.write({ items: store.read().items.map((i) => (i.organizationId === organizationId && i.batchId === batchId && byId.has(i.id) ? { ...i, included: byId.get(i.id) as boolean } : i)) });
    },
    async setStatus(organizationId, itemId, status, error) {
      const current = store.read().items.find((i) => i.organizationId === organizationId && i.id === itemId);
      if (!current || current.status !== 'pending') return false;
      store.write({ items: store.read().items.map((i) => (i === current ? { ...i, status, error } : i)) });
      return true;
    },
    async deleteByBatch(organizationId, batchId) {
      store.write({ items: without(organizationId, batchId) });
    },
  };
}

export function createInMemoryImportAnalyses(store: ImportStore): ImportAnalysisRepository {
  return {
    async save(analysis) {
      store.write({ analyses: [...store.read().analyses.filter((a) => a.batchId !== analysis.batchId), analysis] });
    },
    async find(organizationId, batchId) {
      return store.read().analyses.find((a) => a.organizationId === organizationId && a.batchId === batchId) ?? null;
    },
    async delete(organizationId, batchId) {
      store.write({ analyses: store.read().analyses.filter((a) => !(a.organizationId === organizationId && a.batchId === batchId)) });
    },
  };
}

export function createInMemoryConsentTokens(store: ImportStore): ConsentTokenRepository {
  return {
    async create(token) {
      store.write({ tokens: [...store.read().tokens, token] });
      return token;
    },
    async findByHash(tokenHash) {
      return store.read().tokens.find((t) => t.tokenHash === tokenHash) ?? null;
    },
    async markUsed(tokenHash, at) {
      const token = store.read().tokens.find((t) => t.tokenHash === tokenHash);
      if (!token || token.usedAt !== null) return false;
      store.write({ tokens: store.read().tokens.map((t) => (t.tokenHash === tokenHash ? { ...t, usedAt: at } : t)) });
      return true;
    },
  };
}

/** Transaction by snapshot over the candidate store and the import store: on failure both go back to what they were. */
export function createInMemoryImportCommit(candidateStore: CandidateStore, importStore: ImportStore, jobs: JobRepository): ImportCommitTransaction {
  const repositories = {
    jobs,
    imports: createInMemoryImportBatches(importStore),
    candidates: createInMemoryCandidateRepository(candidateStore),
    applications: createInMemoryApplicationRepository(candidateStore),
    extractions: createInMemoryCvExtractionRepository(candidateStore),
    notes: createInMemoryCandidateNoteRepository(candidateStore),
    stageEvents: createInMemoryStageEvents(candidateStore),
    importItems: createInMemoryImportItems(importStore),
    consentTokens: createInMemoryConsentTokens(importStore),
  };
  return {
    async run(work) {
      const before = { candidates: candidateStore.read(), imports: importStore.read() };
      try {
        return await work(repositories);
      } catch (error) {
        candidateStore.write(before.candidates);
        importStore.write(before.imports);
        throw error;
      }
    },
  };
}
