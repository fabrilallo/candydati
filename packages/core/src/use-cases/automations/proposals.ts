import { proposalStaleReason, type Application, type Job, type MoveProposal } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { toActorUserId } from '../../actor-user.js';
import type { MemberDirectory, NotificationRepository } from '../../automation-ports.js';
import type { CandidateDeps } from '../../candidate-ports.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import type { MoveProposalRepository } from '../../proposal-ports.js';
import { defineUseCase } from '../../use-case.js';
import { moveApplication } from '../candidates/move-application.js';
import type { MoveApplicationResult } from '../candidates/views.js';
import { stageName } from '../messaging/shared.js';

/** Proposals are read and acted on with the candidate dependencies: confirming one is the normal move. */
export interface ProposalDeps extends CandidateDeps {
  readonly moveProposals: MoveProposalRepository;
  /** Who is told when someone proposes a move: the job owner, if they can still open the job. */
  readonly members: MemberDirectory;
  readonly notifications: NotificationRepository;
}

export const PROPOSALS_LIST_MAX = 100;

export interface MoveProposalView {
  readonly proposal: MoveProposal;
  readonly candidate: { readonly id: string; readonly firstName: string; readonly lastName: string };
  readonly job: { readonly id: string; readonly title: string };
  /** Null when the stage has no readable name. */
  readonly fromLabel: string | null;
  readonly toLabel: string | null;
}

const labelOf = (job: Job, stageId: string): string | null => stageName(job, stageId) || null;

async function viewsOf(deps: ProposalDeps, organizationId: string, proposals: readonly MoveProposal[], now: Date): Promise<readonly MoveProposalView[]> {
  const views: MoveProposalView[] = [];
  const jobs = new Map<string, Job | null>();
  for (const proposal of proposals) {
    const application = await deps.applications.findById(organizationId, proposal.applicationId);
    if (!application || proposalStaleReason(proposal, application, now) !== null) continue;
    if (!jobs.has(proposal.jobId)) jobs.set(proposal.jobId, await deps.jobs.findById(organizationId, proposal.jobId));
    const job = jobs.get(proposal.jobId);
    const candidate = await deps.candidates.findById(organizationId, application.candidateId);
    if (!job || !candidate) continue;
    views.push({
      proposal,
      candidate: { id: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName },
      job: { id: job.id, title: job.content.title },
      fromLabel: labelOf(job, proposal.fromStageId),
      toLabel: labelOf(job, proposal.toStageId),
    });
  }
  return views;
}

/**
 * The open move proposals a person can act on: of one application, or of every job they reach (the work queue). Only
 * live ones: a proposal whose application moved, was decided or which expired is left out. Oldest first.
 */
export const listMoveProposals = defineUseCase<ProposalDeps, z.ZodObject<{ applicationId: z.ZodOptional<z.ZodString>; limit: z.ZodDefault<z.ZodNumber> }>, readonly MoveProposalView[]>({
  name: 'listMoveProposals',
  input: z.object({ applicationId: z.string().min(1).optional(), limit: z.number().int().min(1).max(PROPOSALS_LIST_MAX).default(50) }),
  permission: 'candidate:read',
  audit: { skip: 'a list of pending suggestions; opening the candidate is audited where it happens' },
  handler: async ({ deps, actor, input }) => {
    const open = await deps.moveProposals.listOpen({ organizationId: actor.organizationId, applicationId: input.applicationId, limit: input.limit });
    return viewsOf(deps, actor.organizationId, open, deps.now());
  },
});

async function requireLiveProposal(deps: ProposalDeps, organizationId: string, id: string): Promise<{ proposal: MoveProposal; application: Application }> {
  const proposal = await deps.moveProposals.findById(organizationId, id);
  if (!proposal) throw new NotFoundError('Proposal not found.');
  const application = await deps.applications.findById(organizationId, proposal.applicationId);
  if (!application) throw new NotFoundError('Proposal not found.');
  const stale = proposalStaleReason(proposal, application, deps.now());
  if (stale !== null) throw new ConflictError(`The proposal can no longer be acted on (${stale}).`);
  return { proposal, application };
}

async function resolveOpen(deps: ProposalDeps, actor: Actor, proposal: MoveProposal, status: 'confirmed' | 'dismissed'): Promise<MoveProposal> {
  const resolved = await deps.moveProposals.resolve(actor.organizationId, proposal.id, { status, resolvedBy: toActorUserId(actor), resolvedAt: deps.now() });
  if (!resolved) throw new ConflictError('The proposal was already acted on.');
  return resolved;
}

const idInput = z.object({ proposalId: z.string().min(1) });

export interface ConfirmProposalResult {
  readonly proposal: MoveProposal;
  readonly moved: MoveApplicationResult;
}

/**
 * A person confirms a proposal: the application moves through the normal move, with THEIR permission (`candidate:move`),
 * their per-job access and their audit entry (`application.moved`), plus `move_proposal.confirmed`. One transaction:
 * if the move is refused, the proposal stays open.
 */
export const confirmMoveProposal = defineUseCase<ProposalDeps, typeof idInput, ConfirmProposalResult>({
  name: 'confirmMoveProposal',
  input: idInput,
  permission: 'candidate:move',
  audit: {
    action: 'move_proposal.confirmed',
    target: (input) => ({ type: 'move_proposal', id: input.proposalId }),
    metadata: (_input, result) => ({ applicationId: result.proposal.applicationId, ruleId: result.proposal.ruleId, from: result.proposal.fromStageId, to: result.proposal.toStageId }),
  },
  handler: async ({ deps, actor, input }) => {
    const { proposal } = await requireLiveProposal(deps, actor.organizationId, input.proposalId);
    const resolved = await resolveOpen(deps, actor, proposal, 'confirmed');
    const moved = await moveApplication(deps, actor, { applicationId: proposal.applicationId, stageId: proposal.toStageId });
    return { proposal: resolved, moved };
  },
});

/** A person dismisses a proposal: nothing moves. Audited as `move_proposal.dismissed`. */
export const dismissMoveProposal = defineUseCase<ProposalDeps, typeof idInput, MoveProposal>({
  name: 'dismissMoveProposal',
  input: idInput,
  permission: 'candidate:move',
  audit: {
    action: 'move_proposal.dismissed',
    target: (input) => ({ type: 'move_proposal', id: input.proposalId }),
    metadata: (_input, proposal) => ({ applicationId: proposal.applicationId, ruleId: proposal.ruleId, from: proposal.fromStageId, to: proposal.toStageId }),
  },
  handler: async ({ deps, actor, input }) => {
    const { proposal } = await requireLiveProposal(deps, actor.organizationId, input.proposalId);
    return resolveOpen(deps, actor, proposal, 'dismissed');
  },
});
