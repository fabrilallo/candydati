import type { Application, ApplicationAttachment, Candidate, CandidateNote, CvExtractionRecord, ResponsePromise, StageEvent } from '@candydati/domain';
import { ConflictError, NotFoundError } from '../errors.js';
import type {
  ApplicationRepository,
  CandidateNoteRepository,
  CandidateRepository,
  CandidateSearch,
  CandidateSummary,
  CvExtractionRepository,
  UserDirectory,
  RetentionPage,
} from '../candidate-ports.js';
import type { JobRepository, OpenApplicationCounts } from '../job-ports.js';
import type { JobViewRow } from '../job-view-ports.js';
import type { ApplicationIntake, IntakeRepositories } from '../intake-ports.js';
import type { AuditLogRepository } from '../ports.js';
import type { OutboxRepository } from '../webhook-ports.js';
import { createInMemoryResponsePromises, createInMemoryStageEvents } from './in-memory-reports.js';
import { cell } from './in-memory-transaction.js';

/** The rows of the four candidate tables. Replaced wholesale (never mutated) so a snapshot is just a reference. */
export interface CandidateStoreState {
  readonly candidates: readonly Candidate[];
  readonly applications: readonly Application[];
  /** Attachments of applications (only migrations write them). */
  readonly attachments: readonly ApplicationAttachment[];
  readonly notes: readonly CandidateNote[];
  readonly extractions: readonly CvExtractionRecord[];
  readonly stageEvents: readonly StageEvent[];
  readonly promises: readonly ResponsePromise[];
  readonly jobViews: readonly JobViewRow[];
}

export interface CandidateStore {
  read(): CandidateStoreState;
  write(next: Partial<CandidateStoreState>): void;
}

export const createCandidateStore = (initial: Partial<CandidateStoreState> = {}): CandidateStore => {
  const state = cell<CandidateStoreState>({ candidates: [], applications: [], attachments: [], notes: [], extractions: [], stageEvents: [], promises: [], jobViews: [], ...initial });
  return {
    read: () => state.get(),
    write: (next) => {
      state.set({ ...state.get(), ...next });
    },
  };
};

const sameKey = (a: { organizationId: string; id: string }, b: { organizationId: string; id: string }) =>
  a.organizationId === b.organizationId && a.id === b.id;
const newestFirst = <T extends { createdAt: Date }>(items: readonly T[]): readonly T[] =>
  items.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

export function createInMemoryCandidateRepository(store: CandidateStore): CandidateRepository {
  const inOrg = (organizationId: string) => store.read().candidates.filter((c) => c.organizationId === organizationId);
  return {
    async create(candidate) {
      if (inOrg(candidate.organizationId).some((c) => c.email.toLowerCase() === candidate.email.toLowerCase())) {
        throw new ConflictError('A candidate with this email already exists.');
      }
      store.write({ candidates: [...store.read().candidates, candidate] });
      return candidate;
    },
    async save(candidate) {
      if (inOrg(candidate.organizationId).some((c) => c.id !== candidate.id && c.email.toLowerCase() === candidate.email.toLowerCase())) {
        throw new ConflictError('A candidate with this email already exists.');
      }
      store.write({ candidates: store.read().candidates.map((c) => (sameKey(c, candidate) ? candidate : c)) });
      return candidate;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((c) => c.id === id) ?? null;
    },
    async findByEmail(organizationId, email) {
      return inOrg(organizationId).find((c) => c.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async findByEmails(organizationId, emails) {
      const wanted = new Set(emails.map((email) => email.toLowerCase()));
      return inOrg(organizationId).filter((c) => wanted.has(c.email.toLowerCase()));
    },
    async findByIds(organizationId, ids) {
      return inOrg(organizationId).filter((c) => ids.includes(c.id));
    },
  };
}

export function createInMemoryApplicationRepository(store: CandidateStore): ApplicationRepository {
  const inOrg = (organizationId: string) => store.read().applications.filter((a) => a.organizationId === organizationId);
  const findOpen = (organizationId: string, jobId: string, candidateId: string) =>
    inOrg(organizationId).find((a) => a.jobId === jobId && a.candidateId === candidateId && a.outcome === null) ?? null;
  const replace = (next: Application): Application => {
    store.write({ applications: store.read().applications.map((a) => (sameKey(a, next) ? next : a)) });
    return next;
  };
  return {
    async create(application) {
      if (application.outcome === null && findOpen(application.organizationId, application.jobId, application.candidateId)) {
        throw new ConflictError('An open application already exists.');
      }
      store.write({ applications: [...store.read().applications, application] });
      return application;
    },
    async transition(organizationId, id, expected, patch) {
      const current = inOrg(organizationId).find((a) => a.id === id);
      if (!current || current.outcome !== null || (expected.stageId !== undefined && current.stageId !== expected.stageId)) {
        throw new ConflictError('The application changed meanwhile.');
      }
      return replace({ ...current, ...patch });
    },
    async update(organizationId, id, patch) {
      const current = inOrg(organizationId).find((a) => a.id === id);
      if (!current) throw new NotFoundError('Application not found.');
      return replace({ ...current, ...patch });
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((a) => a.id === id) ?? null;
    },
    async findOpen(organizationId, jobId, candidateId) {
      return findOpen(organizationId, jobId, candidateId);
    },
    async listByJob(organizationId, jobId) {
      return newestFirst(inOrg(organizationId).filter((a) => a.jobId === jobId));
    },
    async listByCandidate(organizationId, candidateId) {
      return newestFirst(inOrg(organizationId).filter((a) => a.candidateId === candidateId));
    },
    async listAwaitingResponse(organizationId, dueBefore) {
      return awaiting(inOrg(organizationId), dueBefore);
    },
    async listAwaitingResponseAcrossOrganizations(dueBefore) {
      return awaiting(store.read().applications, dueBefore);
    },
    async listRetentionExpiringBefore(organizationId, before, page) {
      return expiring(inOrg(organizationId), before, page);
    },
    async listRetentionExpiringAcrossOrganizations(before, page) {
      return expiring(store.read().applications, before, page);
    },
    async listByImportBatch(organizationId, batchId) {
      return newestFirst(inOrg(organizationId).filter((a) => a.importBatchId === batchId));
    },
    async countCreatedSince(organizationId, since, jobId) {
      return inOrg(organizationId).filter((a) => a.source === 'careers_page' && a.createdAt >= since && (jobId === undefined || a.jobId === jobId)).length;
    },
    async listAttachments(organizationId, applicationIds) {
      const ids = new Set(applicationIds);
      return store
        .read()
        .attachments.filter((f) => f.organizationId === organizationId && ids.has(f.applicationId))
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    },
    async findAttachment(organizationId, applicationId, attachmentId) {
      return store.read().attachments.find((f) => f.organizationId === organizationId && f.applicationId === applicationId && f.id === attachmentId) ?? null;
    },
  };
}

/** Keyset order `(retentionExpiresAt, id)`, like Postgres; with `page`, at most `limit` rows after the cursor. */
const expiring = (applications: readonly Application[], before: Date, page?: RetentionPage): readonly Application[] => {
  const key = (a: Pick<Application, 'retentionExpiresAt' | 'id'>): string => `${a.retentionExpiresAt.toISOString()}\u0000${a.id}`;
  const sorted = applications.filter((a) => a.retentionExpiresAt <= before).toSorted((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  if (!page) return sorted;
  const after = page.after;
  return (after ? sorted.filter((a) => key(a) > key(after)) : sorted).slice(0, page.limit);
};

const awaiting = (applications: readonly Application[], dueBefore: Date): readonly Application[] =>
  applications
    .filter((a) => a.outcome === null && a.respondedAt === null && a.responseDueAt !== null && a.responseDueAt <= dueBefore)
    .toSorted((a, b) => (a.responseDueAt?.getTime() ?? 0) - (b.responseDueAt?.getTime() ?? 0));

export function createInMemoryCandidateNoteRepository(store: CandidateStore): CandidateNoteRepository {
  const inOrg = (organizationId: string) => store.read().notes.filter((n) => n.organizationId === organizationId);
  return {
    async create(note) {
      store.write({ notes: [...store.read().notes, note] });
      return note;
    },
    async listByCandidate(organizationId, candidateId) {
      return newestFirst(inOrg(organizationId).filter((n) => n.candidateId === candidateId));
    },
    async countByApplication(organizationId, applicationIds) {
      const notes = inOrg(organizationId);
      return Object.fromEntries(applicationIds.map((id) => [id, notes.filter((n) => n.applicationId === id).length]));
    },
  };
}

export function createInMemoryCvExtractionRepository(store: CandidateStore): CvExtractionRepository {
  const inOrg = (organizationId: string) => store.read().extractions.filter((e) => e.organizationId === organizationId);
  return {
    async upsert(record) {
      const others = store.read().extractions.filter((e) => !(e.organizationId === record.organizationId && e.applicationId === record.applicationId));
      store.write({ extractions: [...others, record] });
      return record;
    },
    async findByApplication(organizationId, applicationId) {
      return inOrg(organizationId).find((e) => e.applicationId === applicationId) ?? null;
    },
    async findByApplications(organizationId, applicationIds) {
      return inOrg(organizationId).filter((e) => applicationIds.includes(e.applicationId));
    },
    async countFinishedSince(organizationId, since) {
      return inOrg(organizationId).filter((e) => (e.status === 'done' || e.status === 'text_only') && e.updatedAt >= since).length;
    },
  };
}

const matchesText = (store: CandidateStore, candidate: Candidate, query: string): boolean => {
  const needle = query.toLowerCase();
  const direct = [`${candidate.firstName} ${candidate.lastName}`, candidate.email, ...candidate.tags].some((value) =>
    value.toLowerCase().includes(needle),
  );
  if (direct) return true;
  const { applications, extractions } = store.read();
  const ids = applications.filter((a) => a.candidateId === candidate.id).map((a) => a.id);
  const words = needle.split(/\s+/).filter(Boolean);
  return extractions.some(
    (e) => ids.includes(e.applicationId) && words.every((word) => (e.text ?? '').toLowerCase().includes(word)),
  );
};

const isVisible = (store: CandidateStore, candidateId: string): boolean => {
  const own = store.read().applications.filter((a) => a.candidateId === candidateId);
  return own.some((a) => a.consentStatus === 'given') || !own.some((a) => a.consentStatus === 'to_renew');
};

export function createInMemoryCandidateSearch(store: CandidateStore): CandidateSearch {
  return {
    async listAfter(organizationId, afterId, limit) {
      return store
        .read()
        .candidates.filter((c) => c.organizationId === organizationId && (afterId === null || c.id > afterId) && isVisible(store, c.id))
        .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, limit);
    },
    async search(query) {
      const text = query.query?.trim() ?? '';
      const summaries: CandidateSummary[] = store
        .read()
        .candidates.filter((c) => c.organizationId === query.organizationId)
        .filter((c) => {
          const own = store.read().applications.filter((a) => a.candidateId === c.id);
          return own.some((a) => a.consentStatus === 'given') || !own.some((a) => a.consentStatus === 'to_renew');
        })
        .filter((c) => query.jobIds === undefined || store.read().applications.some((a) => a.candidateId === c.id && query.jobIds?.includes(a.jobId)))
        .filter((c) => query.talentPool === undefined || c.talentPool === query.talentPool)
        .filter((c) => query.tag === undefined || c.tags.includes(query.tag))
        .filter((c) => text === '' || matchesText(store, c, text))
        .map((candidate) => {
          const own = store
            .read()
            .applications.filter((a) => a.candidateId === candidate.id && a.consentStatus === 'given' && (query.jobIds === undefined || query.jobIds.includes(a.jobId)));
          const last = own.map((a) => a.createdAt.getTime()).reduce((max, t) => Math.max(max, t), 0);
          return { candidate, applicationCount: own.length, lastAppliedAt: own.length > 0 ? new Date(last) : null };
        });
      const ordered = summaries.toSorted(
        (a, b) => (b.lastAppliedAt?.getTime() ?? 0) - (a.lastAppliedAt?.getTime() ?? 0) || a.candidate.id.localeCompare(b.candidate.id),
      );
      const start = (query.page - 1) * query.limit;
      return { items: ordered.slice(start, start + query.limit), total: ordered.length };
    },
  };
}

export const createInMemoryUserDirectory = (names: Readonly<Record<string, string>> = {}): UserDirectory => ({
  async namesOf(_organizationId, userIds) {
    return Object.fromEntries(userIds.filter((id) => id in names).map((id) => [id, names[id] as string]));
  },
  async actorNamesOf(_organizationId, userIds) {
    return Object.fromEntries(userIds.filter((id) => id in names).map((id) => [id, names[id] as string]));
  },
});

/** Transaction by snapshot: on failure the store goes back to what it was when `run` started. */
export function createInMemoryApplicationIntake(store: CandidateStore, auditLog: AuditLogRepository, outbox: OutboxRepository, jobs: JobRepository): ApplicationIntake {
  const repositories: IntakeRepositories = {
    jobs,
    candidates: createInMemoryCandidateRepository(store),
    applications: createInMemoryApplicationRepository(store),
    extractions: createInMemoryCvExtractionRepository(store),
    auditLog,
    outbox,
    stageEvents: createInMemoryStageEvents(store),
    promises: createInMemoryResponsePromises(store),
  };
  return {
    async run(work) {
      const before = store.read();
      try {
        return await work(repositories);
      } catch (error) {
        store.write(before);
        throw error;
      }
    },
  };
}

export function createInMemoryApplicationCounts(store: CandidateStore): OpenApplicationCounts {
  return {
    async openByStage(organizationId, jobId) {
      const open = store.read().applications.filter((a) => a.organizationId === organizationId && a.jobId === jobId && a.outcome === null);
      return open.reduce<Record<string, number>>((counts, a) => ({ ...counts, [a.stageId]: (counts[a.stageId] ?? 0) + 1 }), {});
    },
  };
}
