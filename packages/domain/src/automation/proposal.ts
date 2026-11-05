import { DAY_MS } from '../response/response-state.js';

/**
 * A suggestion, written by a `propose_move` rule or by an external assistant over MCP (`propose_stage_move`), to move an
 * application to another stage. It moves nothing: a person
 * confirms it (the normal move, with their permissions and audit) or dismisses it. It is only valid while the application
 * is still open, still in the stage it was proposed from, and before it expires.
 */
export const MOVE_PROPOSAL_STATUSES = ['open', 'confirmed', 'dismissed', 'expired', 'dropped'] as const;
export type MoveProposalStatus = (typeof MOVE_PROPOSAL_STATUSES)[number];

/**
 * Who wrote the proposal: a rule, or a person's API key or connected app (MCP). Never the one who confirms it.
 * `user` and `agent` are reserved for the same use case called from the web or the assistant.
 */
export const MOVE_PROPOSAL_SOURCES = ['rule', 'user', 'agent', 'api_key', 'connected_app'] as const;
export type MoveProposalSource = (typeof MOVE_PROPOSAL_SOURCES)[number];

/** The reason given with a proposal not written by a rule: short, plain text, shown as data and never as instructions. */
export const MOVE_PROPOSAL_REASON_MAX = 500;

/** A proposal nobody acted on lapses after this many days. */
export const MOVE_PROPOSAL_TTL_DAYS = 14;

export interface MoveProposal {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly jobId: string;
  /** The rule that proposed it; null once the rule is deleted. */
  readonly ruleId: string | null;
  readonly fromStageId: string;
  readonly toStageId: string;
  /** The creator of the rule, or the person the key or app acts for: whose suggestion this is. Never who confirms. */
  readonly proposedBy: string;
  readonly source: MoveProposalSource;
  /** Why, in a few words, for a proposal not written by a rule (a rule's reason is the rule itself); otherwise null. */
  readonly reason: string | null;
  readonly status: MoveProposalStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** Who confirmed or dismissed it; null while open, and for expired or dropped proposals. */
  readonly resolvedBy: string | null;
  readonly resolvedAt: Date | null;
}

export const proposalExpiresAt = (createdAt: Date): Date => new Date(createdAt.getTime() + MOVE_PROPOSAL_TTL_DAYS * DAY_MS);

/** Why an open proposal can no longer be acted on, or null when it still can. */
export type ProposalStaleReason = 'not_open' | 'expired' | 'decided' | 'stage_changed';

export function proposalStaleReason(
  proposal: Pick<MoveProposal, 'status' | 'expiresAt' | 'fromStageId'>,
  application: { readonly stageId: string; readonly outcome: unknown },
  now: Date,
): ProposalStaleReason | null {
  if (proposal.status !== 'open') return 'not_open';
  if (proposal.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (application.outcome !== null) return 'decided';
  if (application.stageId !== proposal.fromStageId) return 'stage_changed';
  return null;
}
