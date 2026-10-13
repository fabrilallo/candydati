import type { Application, Candidate, CandidateNote, CvExtractionRecord, ResponsePromise, StageEvent } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type {
  ApplicationRepository,
  CandidateNoteRepository,
  CandidateRepository,
  CandidateSearch,
  CandidateSummary,
  CvExtractionRepository,
  UserDirectory,
} from '../candidate-ports.js';
import type { OpenApplicationCounts } from '../job-ports.js';
import type { ApplicationIntake, IntakeRepositories } from '../intake-ports.js';
import type { AuditLogRepository } from '../ports.js';
import type { OutboxRepository } from '../webhook-ports.js';
import { createInMemoryResponsePromises, createInMemoryStageEvents } from './in-memory-reports.js';

/** The rows of the four candidate tables. Replaced wholesale (never mutated) so a snapshot is just a reference. */
export interface CandidateStoreState {
  readonly candidates: readonly Candidate[];
  readonly applications: readonly Application[];
  readonly notes: readonly CandidateNote[];
  readonly extractions: readonly CvExtractionRecord[];
  readonly stageEvents: readonly StageEvent[];
  readonly promises: readonly ResponsePromise[];
}

export interface CandidateStore {
  read(): CandidateStoreState;
  write(next: Partial<CandidateStoreState>): void;
}

export const createCandidateStore = (initial: Partial<CandidateStoreState> = {}): CandidateStore => {
  let state: CandidateStoreState = { candidates: [], applications: [], notes: [], extractions: [], stageEvents: [], promises: [], ...initial };
  return {
    read: () => state,
    write: (next) => {
      state = { ...state, ...next };
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
  return {
    async create(application) {
      if (application.outcome === null && findOpen(application.organizationId, application.jobId, application.candidateId)) {
        throw new ConflictError('An open application already exists.');
      }
      store.write({ applications: [...store.read().applications, application] });
      return application;
    },
    async save(application) {
      store.write({ applications: store.read().applications.map((a) => (sameKey(a, application) ? application : a)) });
      return application;
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
    async listRetentionExpiringBefore(organizationId, before) {
      return expiring(inOrg(organizationId), before);
    },
    async listRetentionExpiringAcrossOrganizations(before) {
      return expiring(store.read().applications, before);
    },
    async listByImportBatch(organizationId, batchId) {
      return newestFirst(inOrg(organizationId).filter((a) => a.importBatchId === batchId));
    },
  };
}

const expiring = (applications: readonly Application[], before: Date): readonly Application[] =>
  applications.filter((a) => a.retentionExpiresAt <= before).toSorted((a, b) => a.retentionExpiresAt.getTime() - b.retentionExpiresAt.getTime());

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

export function createInMemoryCandidateSearch(store: CandidateStore): CandidateSearch {
  return {
    async search(query) {
      const text = query.query?.trim() ?? '';
      const summaries: CandidateSummary[] = store
        .read()
        .candidates.filter((c) => c.organizationId === query.organizationId)
        .filter((c) => {
          const own = store.read().applications.filter((a) => a.candidateId === c.id);
          return own.some((a) => a.consentStatus === 'given') || !own.some((a) => a.consentStatus === 'to_renew');
        })
        .filter((c) => query.talentPool === undefined || c.talentPool === query.talentPool)
        .filter((c) => query.tag === undefined || c.tags.includes(query.tag))
        .filter((c) => text === '' || matchesText(store, c, text))
        .map((candidate) => {
          const own = store.read().applications.filter((a) => a.candidateId === candidate.id && a.consentStatus === 'given');
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
});

/** Transaction by snapshot: on failure the store goes back to what it was when `run` started. */
export function createInMemoryApplicationIntake(store: CandidateStore, auditLog: AuditLogRepository, outbox: OutboxRepository): ApplicationIntake {
  const repositories: IntakeRepositories = {
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
