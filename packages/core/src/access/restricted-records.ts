import type { CandidateNote, FeedbackRequest, InterviewFeedback, MoveProposal } from '@candydati/domain';
import type { CandidateNoteRepository } from '../candidate-ports.js';
import type { FeedbackRequestRepository, InterviewFeedbackRepository } from '../feedback-ports.js';
import type { MoveProposalRepository } from '../proposal-ports.js';
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

/**
 * The reason an assistant gave with a move proposal is written at the stage the application was in: at a restricted stage
 * only those who read that stage (and the person it was proposed for) read it. Everyone else still sees the proposal
 * itself, which says nothing more than a move would, with no reason.
 */
const aboutReason = (proposal: MoveProposal): RestrictedItem => ({ applicationId: proposal.applicationId, stageId: proposal.fromStageId, authorIds: [proposal.proposedBy] });

export function restrictProposalReasons(raw: MoveProposalRepository, ctx: StageRestrictionContext): MoveProposalRepository {
  const readable = async (proposals: readonly MoveProposal[]): Promise<readonly MoveProposal[]> => {
    const withReason = proposals.filter((proposal) => proposal.reason !== null);
    if (withReason.length === 0 || (await ctx.hidden()).size === 0) return proposals;
    const kept = new Set(await ctx.visible(withReason, aboutReason));
    return proposals.map((proposal) => (proposal.reason === null || kept.has(proposal) ? proposal : { ...proposal, reason: null }));
  };
  return {
    ...raw,
    async findById(organizationId, id) {
      const proposal = await raw.findById(organizationId, id);
      return proposal ? ((await readable([proposal]))[0] ?? null) : null;
    },
    listOpen: async (query) => readable(await raw.listOpen(query)),
  };
}
