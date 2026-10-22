import type { Application, Candidate, CandidateNote } from '@candydati/domain';
import type {
  ApplicationRepository,
  CandidateNoteRepository,
  CandidateRepository,
  CandidateSearch,
  CvExtractionRepository,
} from '../candidate-ports.js';
import { NotFoundError } from '../errors.js';
import type { JobScopeContext } from './job-scope.js';

const applicationNotFound = (): never => {
  throw new NotFoundError('Application not found.');
};
const candidateNotFound = (): never => {
  throw new NotFoundError('Candidate not found.');
};

/** Applications exist only through the jobs in scope. The cross-organization reads are for system jobs only. */
export function scopeApplications(raw: ApplicationRepository, ctx: JobScopeContext): ApplicationRepository {
  const one = async (application: Application | null): Promise<Application | null> =>
    application && (await ctx.allowsJob(application.jobId)) ? application : null;
  const many = async (applications: readonly Application[]): Promise<readonly Application[]> => {
    const ids = await ctx.jobIds();
    return ids === null ? applications : applications.filter((application) => ids.includes(application.jobId));
  };
  const guard = async (organizationId: string, id: string): Promise<void> => {
    if (!(await one(await raw.findById(organizationId, id)))) applicationNotFound();
  };
  return {
    async create(application) {
      if (!(await ctx.allowsJob(application.jobId))) applicationNotFound();
      return raw.create(application);
    },
    async transition(organizationId, id, expected, patch) {
      await guard(organizationId, id);
      return raw.transition(organizationId, id, expected, patch);
    },
    async update(organizationId, id, patch) {
      await guard(organizationId, id);
      return raw.update(organizationId, id, patch);
    },
    findById: async (organizationId, id) => one(await raw.findById(organizationId, id)),
    findOpen: async (organizationId, jobId, candidateId) => ((await ctx.allowsJob(jobId)) ? raw.findOpen(organizationId, jobId, candidateId) : null),
    listByJob: async (organizationId, jobId) => ((await ctx.allowsJob(jobId)) ? raw.listByJob(organizationId, jobId) : []),
    listByCandidate: async (organizationId, candidateId) => many(await raw.listByCandidate(organizationId, candidateId)),
    listAwaitingResponse: async (organizationId, dueBefore) => many(await raw.listAwaitingResponse(organizationId, dueBefore)),
    listAwaitingResponseAcrossOrganizations: (dueBefore) => raw.listAwaitingResponseAcrossOrganizations(dueBefore),
    listRetentionExpiringBefore: async (organizationId, before, page) => many(await raw.listRetentionExpiringBefore(organizationId, before, page)),
    listRetentionExpiringAcrossOrganizations: (before, page) => raw.listRetentionExpiringAcrossOrganizations(before, page),
    listByImportBatch: async (organizationId, batchId) => many(await raw.listByImportBatch(organizationId, batchId)),
    countCreatedSince: (organizationId, since, jobId) => raw.countCreatedSince(organizationId, since, jobId),
    listAttachments: async (organizationId, applicationIds) => raw.listAttachments(organizationId, await ctx.applicationsIn(applicationIds)),
    findAttachment: async (organizationId, applicationId, attachmentId) =>
      (await ctx.applicationsIn([applicationId])).length > 0 ? raw.findAttachment(organizationId, applicationId, attachmentId) : null,
  };
}

/** A candidate is visible when at least one of their applications belongs to a job in scope. */
export function scopeCandidates(raw: CandidateRepository, ctx: JobScopeContext): CandidateRepository {
  const one = async (candidate: Candidate | null): Promise<Candidate | null> =>
    candidate && (await ctx.candidatesIn([candidate.id])).length > 0 ? candidate : null;
  const many = async (candidates: readonly Candidate[]): Promise<readonly Candidate[]> => {
    const visible = new Set(await ctx.candidatesIn(candidates.map((candidate) => candidate.id)));
    return candidates.filter((candidate) => visible.has(candidate.id));
  };
  return {
    create: (candidate) => raw.create(candidate),
    async save(candidate) {
      if (!(await one(await raw.findById(candidate.organizationId, candidate.id)))) candidateNotFound();
      return raw.save(candidate);
    },
    findById: async (organizationId, id) => one(await raw.findById(organizationId, id)),
    findByEmail: async (organizationId, email) => one(await raw.findByEmail(organizationId, email)),
    findByIds: async (organizationId, ids) => many(await raw.findByIds(organizationId, ids)),
    findByEmails: async (organizationId, emails) => many(await raw.findByEmails(organizationId, emails)),
  };
}

export function scopeCandidateSearch(raw: CandidateSearch, ctx: JobScopeContext): CandidateSearch {
  return {
    async listAfter(organizationId, afterId, limit) {
      const candidates = await raw.listAfter(organizationId, afterId, limit);
      const visible = new Set(await ctx.candidatesIn(candidates.map((candidate) => candidate.id)));
      return candidates.filter((candidate) => visible.has(candidate.id));
    },
    async search(query) {
      const jobIds = await ctx.jobIds();
      return raw.search(jobIds === null ? query : { ...query, jobIds });
    },
    async findByCriteria(query) {
      const jobIds = await ctx.jobIds();
      return raw.findByCriteria(jobIds === null ? query : { ...query, jobIds });
    },
  };
}

/**
 * Notes about an application follow its job. A note on the candidate as a whole (no application) may be about any job:
 * a scoped actor sees only the ones they wrote.
 */
export function scopeNotes(raw: CandidateNoteRepository, ctx: JobScopeContext): CandidateNoteRepository {
  const visibleNotes = async (notes: readonly CandidateNote[]): Promise<readonly CandidateNote[]> => {
    if ((await ctx.jobIds()) === null) return notes;
    const applicationIds = [...new Set(notes.flatMap((note) => (note.applicationId ? [note.applicationId] : [])))];
    const allowed = new Set(await ctx.applicationsIn(applicationIds));
    return notes.filter((note) => (note.applicationId === null ? note.authorId === ctx.userId : allowed.has(note.applicationId)));
  };
  return {
    async create(note) {
      const allowed = note.applicationId === null ? (await ctx.candidatesIn([note.candidateId])).length > 0 : (await ctx.applicationsIn([note.applicationId])).length > 0;
      if (!allowed) candidateNotFound();
      return raw.create(note);
    },
    listByCandidate: async (organizationId, candidateId) => visibleNotes(await raw.listByCandidate(organizationId, candidateId)),
    countByApplication: async (organizationId, applicationIds) => raw.countByApplication(organizationId, await ctx.applicationsIn(applicationIds)),
  };
}

export function scopeExtractions(raw: CvExtractionRepository, ctx: JobScopeContext): CvExtractionRepository {
  return {
    upsert: (record) => raw.upsert(record),
    findByApplication: async (organizationId, applicationId) =>
      (await ctx.applicationsIn([applicationId])).length > 0 ? raw.findByApplication(organizationId, applicationId) : null,
    findByApplications: async (organizationId, applicationIds) => raw.findByApplications(organizationId, await ctx.applicationsIn(applicationIds)),
    countFinishedSince: (organizationId, since) => raw.countFinishedSince(organizationId, since),
  };
}
