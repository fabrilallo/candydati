import type { CandidateNote, FeedbackRequest, InterviewFeedback } from '@candydati/domain';
import type { CandidateNoteRepository } from '../candidate-ports.js';
import type { FeedbackRequestRepository, InterviewFeedbackRepository } from '../feedback-ports.js';
import type { RestrictedItem, StageRestrictionContext } from './restricted-stages.js';

/**
 * The repositories of what is written at a stage (notes, interview feedback and its requests), limited to what the actor
 * may read under restricted stages (PRODUCT.md §6.2). Writes pass through: an author always reads what they wrote.
 * Methods the public form and the system jobs use (tokens, cross-organization scans) pass through too: they never run for
 * a user, a key or the assistant.
 */
const aboutNote = (note: CandidateNote): RestrictedItem => ({ applicationId: note.applicationId, stageId: note.stageId, authorIds: [note.authorId] });

const aboutRequest = (request: FeedbackRequest): RestrictedItem => ({
  applicationId: request.applicationId,
  stageId: request.stageId,
  authorIds: [request.interviewerUserId, request.requestedBy],
});

export function restrictNotes(raw: CandidateNoteRepository, ctx: StageRestrictionContext): CandidateNoteRepository {
  return {
    create: (note) => raw.create(note),
    listByCandidate: async (organizationId, candidateId) => ctx.visible(await raw.listByCandidate(organizationId, candidateId), aboutNote),
    listByApplications: async (organizationId, applicationIds) => ctx.visible(await raw.listByApplications(organizationId, applicationIds), aboutNote),
    async countByApplication(organizationId, applicationIds) {
      if ((await ctx.hidden()).size === 0) return raw.countByApplication(organizationId, applicationIds);
      const notes = await ctx.visible(await raw.listByApplications(organizationId, applicationIds), aboutNote);
      return Object.fromEntries(applicationIds.map((id) => [id, notes.filter((note) => note.applicationId === id).length]));
    },
  };
}

export function restrictFeedbackRequests(raw: FeedbackRequestRepository, ctx: StageRestrictionContext): FeedbackRequestRepository {
  return {
    ...raw,
    async findById(organizationId, id) {
      const request = await raw.findById(organizationId, id);
      return request && (await ctx.visible([request], aboutRequest)).length > 0 ? request : null;
    },
    listByApplication: async (organizationId, applicationId) => ctx.visible(await raw.listByApplication(organizationId, applicationId), aboutRequest),
  };
}

/** Feedback is authored by the interviewer of its request: `requests` (unrestricted) says who that is. */
export function restrictInterviewFeedback(
  raw: InterviewFeedbackRepository,
  ctx: StageRestrictionContext,
  requests: FeedbackRequestRepository | undefined,
): InterviewFeedbackRepository {
  const visible = async (organizationId: string, applicationId: string, items: readonly InterviewFeedback[]): Promise<readonly InterviewFeedback[]> => {
    if (items.length === 0 || (await ctx.hidden()).size === 0) return items;
    const asked = requests ? await requests.listByApplication(organizationId, applicationId) : [];
    const interviewerOf = new Map(asked.map((request) => [request.id, request.interviewerUserId]));
    return ctx.visible(items, (item) => ({ applicationId: item.applicationId, stageId: item.stageId, authorIds: [interviewerOf.get(item.requestId) ?? null] }));
  };
  return {
    ...raw,
    async findByRequest(organizationId, requestId) {
      const feedback = await raw.findByRequest(organizationId, requestId);
      return feedback && (await visible(organizationId, feedback.applicationId, [feedback])).length > 0 ? feedback : null;
    },
    listByApplication: async (organizationId, applicationId) => visible(organizationId, applicationId, await raw.listByApplication(organizationId, applicationId)),
  };
}
