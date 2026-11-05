import {
  MOVE_PROPOSAL_REASON_MAX,
  pipelineStagesOf,
  proposalExpiresAt,
  proposalStaleReason,
  type Application,
  type MoveProposal,
  type MoveProposalSource,
} from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { isVisibleApplication, requireApplication } from '../candidates/shared.js';
import { defineUseCase } from '../../use-case.js';
import { notifyProposedMove } from './proposal-notice.js';
import type { ProposalDeps } from './proposals.js';

// eslint-disable-next-line no-control-regex -- the point is to refuse control characters (newlines and tabs stay)
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const proposeInput = z.object({
  applicationId: z.string().min(1),
  toStageId: z.string().min(1),
  /** Plain text: shown to people as data, never run or rendered as markup. */
  reason: z
    .string()
    .trim()
    .min(1)
    .max(MOVE_PROPOSAL_REASON_MAX)
    .refine((value) => !CONTROL_CHARACTERS.test(value), 'control_characters'),
});

export interface ProposeMoveResult {
  readonly proposal: MoveProposal;
  /** False when the same proposal was already waiting for a person: it is returned as it is, nothing new is written. */
  readonly created: boolean;
}

const sourceOf = (actor: Actor): MoveProposalSource => {
  if (actor.type === 'system') throw new ForbiddenError('A proposal needs a person or a key acting for one.');
  return actor.type;
};

/**
 * The open proposal of the application, if any. One that lapsed (expired, or its application moved) is closed first, so
 * it never blocks a new one: the hourly scan would have closed it anyway.
 */
async function openProposalOf(deps: ProposalDeps, application: Application): Promise<MoveProposal | null> {
  if (!deps.moveProposals) return null;
  const [open] = await deps.moveProposals.listOpen({ organizationId: application.organizationId, applicationId: application.id, limit: 1 });
  if (!open) return null;
  const stale = proposalStaleReason(open, application, deps.now());
  if (stale === null) return open;
  const status = stale === 'expired' ? 'expired' : 'dropped';
  await deps.moveProposals.resolve(application.organizationId, open.id, { status, resolvedBy: null, resolvedAt: deps.now() });
  return null;
}

async function requireTarget(deps: ProposalDeps, application: Application, toStageId: string): Promise<void> {
  if (application.outcome !== null) throw new ConflictError('The application is already decided.');
  const job = await requireJob(deps, application.organizationId, application.jobId);
  if (!pipelineStagesOf(job.content.process).some((stage) => stage.id === toStageId)) {
    throw new ValidationError([{ path: 'toStageId', message: 'unknown_stage' }]);
  }
  if (application.stageId === toStageId) throw new ValidationError([{ path: 'toStageId', message: 'already_in_stage' }]);
}

function newProposal(deps: ProposalDeps, actor: Actor, application: Application, input: z.output<typeof proposeInput>): MoveProposal {
  const now = deps.now();
  return {
    id: deps.newId(),
    organizationId: application.organizationId,
    applicationId: application.id,
    jobId: application.jobId,
    ruleId: null,
    fromStageId: application.stageId,
    toStageId: input.toStageId,
    proposedBy: toActorUserId(actor),
    source: sourceOf(actor),
    reason: input.reason,
    status: 'open',
    createdAt: now,
    expiresAt: proposalExpiresAt(now),
    resolvedBy: null,
    resolvedAt: null,
  };
}

/**
 * A person, or a key or connected app acting for one (MCP `propose_stage_move`), PROPOSES moving an application to another
 * stage of its job, with a short reason. Nothing moves: the proposal waits in the attention list and on the application
 * until a person confirms it (the normal move, with their own `candidate:move`) or dismisses it (PRODUCT.md §2.4).
 *
 * `candidate:propose_move` is held by exactly the roles that may move, and the application is read through the same
 * per-job scope as a move: who could not move it cannot propose it. Idempotent for the same target: the proposal already
 * waiting is returned, and nobody is told again. A new proposal tells the job owner (never the proposer), as a rule's
 * does. A different one waiting (a rule's too) is a conflict: a person acts on it first.
 */
export const proposeApplicationMove = defineUseCase<ProposalDeps, typeof proposeInput, ProposeMoveResult>({
  name: 'proposeApplicationMove',
  input: proposeInput,
  permission: 'candidate:propose_move',
  audit: {
    action: 'move_proposal.proposed',
    target: (_input, result) => ({ type: 'move_proposal', id: result.proposal.id }),
    // Ids only: the reason is free text written by an assistant, kept with the proposal and not copied into the log.
    metadata: (_input, result) => ({
      applicationId: result.proposal.applicationId,
      jobId: result.proposal.jobId,
      from: result.proposal.fromStageId,
      to: result.proposal.toStageId,
      source: result.proposal.source,
      created: result.created,
    }),
  },
  handler: async ({ deps, actor, input }) => {
    if (!deps.moveProposals) throw new Error('move proposals are not wired');
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    if (!isVisibleApplication(application, undefined)) throw new NotFoundError('Application not found.');
    await requireTarget(deps, application, input.toStageId);
    const open = await openProposalOf(deps, application);
    if (open?.toStageId === input.toStageId) return { proposal: open, created: false };
    if (open) throw new ConflictError('Another move proposal for this application is waiting for a person to confirm or dismiss it.');
    const created = await deps.moveProposals.createIfNoneOpen(newProposal(deps, actor, application, input));
    if (!created) throw new ConflictError('Another move proposal for this application was just made.');
    await notifyProposedMove(deps, await requireJob(deps, application.organizationId, application.jobId), application, created);
    return { proposal: created, created: true };
  },
});
