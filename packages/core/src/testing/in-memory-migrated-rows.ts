import type { MigratedRowsRepository } from '../migration-commit-ports.js';
import type { CandidateStore } from './in-memory-candidates.js';
import type { InMemoryJobRepository } from './in-memory-jobs.js';
import type { MessagingStore } from './in-memory-messaging.js';
import type { MigratedRowTag, MigrationStore } from './in-memory-migrations.js';

export interface MigratedRowsWorld {
  readonly store: CandidateStore;
  readonly messagingStore: MessagingStore;
  readonly jobs: InMemoryJobRepository;
  readonly migrationStore: MigrationStore;
}

/** Same rules as the Postgres adapter; the batch of each row lives in the migration store's tags. */
export function createInMemoryMigratedRows({ store, messagingStore, jobs, migrationStore }: MigratedRowsWorld): MigratedRowsRepository {
  const tag = (kind: MigratedRowTag['kind'], batchId: string, ids: readonly string[]): void => {
    migrationStore.write({ tags: [...migrationStore.read().tags, ...ids.map((id) => ({ kind, id, batchId }))] });
  };
  const tagged = (kind: MigratedRowTag['kind'], batchId: string): ReadonlySet<string> =>
    new Set(migrationStore.read().tags.filter((t) => t.kind === kind && t.batchId === batchId).map((t) => t.id));
  return {
    async insertJob(batchId, job) {
      await jobs.create(job);
      tag('job', batchId, [job.id]);
    },
    async insertCandidate(batchId, candidate) {
      store.write({ candidates: [...store.read().candidates, candidate] });
      tag('candidate', batchId, [candidate.id]);
    },
    async insertStageEvents(batchId, events) {
      store.write({ stageEvents: [...store.read().stageEvents, ...events] });
      tag('stage_event', batchId, events.map((e) => e.id));
    },
    async insertNotes(batchId, notes) {
      store.write({ notes: [...store.read().notes, ...notes] });
      tag('note', batchId, notes.map((n) => n.id));
    },
    async insertMessages(batchId, messages) {
      messagingStore.write({ messages: [...messagingStore.read().messages, ...messages] });
      tag('message', batchId, messages.map((m) => m.id));
    },
    async candidateIdsOf(organizationId, batchId) {
      const own = <T extends { readonly organizationId: string }>(row: T): boolean => row.organizationId === organizationId;
      const notes = tagged('note', batchId);
      const messages = tagged('message', batchId);
      const ids = [
        ...store.read().applications.filter((a) => own(a) && a.migrationBatchId === batchId).map((a) => a.candidateId),
        ...store.read().candidates.filter((c) => own(c) && tagged('candidate', batchId).has(c.id)).map((c) => c.id),
        ...store.read().notes.filter((n) => own(n) && notes.has(n.id)).map((n) => n.candidateId),
        ...messagingStore.read().messages.filter((m) => own(m) && messages.has(m.id)).map((m) => m.candidateId),
      ];
      return [...new Set(ids)].toSorted();
    },
    async jobIdsOf(organizationId, batchId) {
      const ids = tagged('job', batchId);
      return jobs.snapshot().filter((j) => j.organizationId === organizationId && ids.has(j.id)).map((j) => j.id).toSorted();
    },
    async deleteHistory(organizationId, batchId, keep) {
      const kept = new Set(keep);
      const keptApplications = new Set(store.read().applications.filter((a) => kept.has(a.candidateId)).map((a) => a.id));
      const notes = tagged('note', batchId);
      const messages = tagged('message', batchId);
      const events = tagged('stage_event', batchId);
      const own = <T extends { readonly organizationId: string }>(row: T): boolean => row.organizationId === organizationId;
      const before = store.read().notes.length + store.read().stageEvents.length + messagingStore.read().messages.length;
      store.write({
        notes: store.read().notes.filter((n) => !(own(n) && notes.has(n.id) && !kept.has(n.candidateId))),
        stageEvents: store.read().stageEvents.filter((e) => !(own(e) && events.has(e.id) && !keptApplications.has(e.applicationId))),
      });
      messagingStore.write({ messages: messagingStore.read().messages.filter((m) => !(own(m) && messages.has(m.id) && !kept.has(m.candidateId))) });
      return before - (store.read().notes.length + store.read().stageEvents.length + messagingStore.read().messages.length);
    },
    async deleteJobIfUnused(organizationId, batchId, jobId) {
      const job = jobs.snapshot().find((j) => j.organizationId === organizationId && j.id === jobId);
      const used = store.read().applications.some((a) => a.organizationId === organizationId && a.jobId === jobId);
      if (!job || !tagged('job', batchId).has(jobId) || job.status === 'published' || used) return false;
      jobs.remove(organizationId, jobId);
      return true;
    },
  };
}
