import type { MoveProposal, MoveProposalStatus, TemplateAutomationRule } from '@candydati/domain';

export interface MoveProposalListQuery {
  readonly organizationId: string;
  /** Absent: every application. */
  readonly applicationId?: string | undefined;
  /** Only proposals about one of these jobs (per-job access). Absent: no job filter. */
  readonly jobIds?: readonly string[] | undefined;
  readonly limit: number;
}

export interface ProposalResolution {
  readonly status: Exclude<MoveProposalStatus, 'open'>;
  readonly resolvedBy: string | null;
  readonly resolvedAt: Date;
}

/** Proposals of `propose_move` rules. Every method takes the organization, except the system expiry. */
export interface MoveProposalRepository {
  /** Stores it unless the application already has an open proposal (then null: the first one stands). */
  createIfNoneOpen(proposal: MoveProposal): Promise<MoveProposal | null>;
  findById(organizationId: string, id: string): Promise<MoveProposal | null>;
  /** Open proposals, oldest first. */
  listOpen(query: MoveProposalListQuery): Promise<readonly MoveProposal[]>;
  /** Closes an open proposal. Null when it was not open any more (someone else acted first): nothing is written. */
  resolve(organizationId: string, id: string, resolution: ProposalResolution): Promise<MoveProposal | null>;
  /** The application moved or was decided: its open proposals are `dropped`. Returns how many. */
  dropOpenForApplication(organizationId: string, applicationId: string, at: Date): Promise<number>;
  /** Open proposals past `expiresAt` become `expired`, across organizations. Only for the system scan. Returns how many. */
  expireDue(now: Date): Promise<number>;
}

/** Rules kept with job templates. Every method takes the organization. */
export interface TemplateAutomationRepository {
  create(rule: TemplateAutomationRule): Promise<TemplateAutomationRule>;
  findById(organizationId: string, id: string): Promise<TemplateAutomationRule | null>;
  /** Oldest first. */
  listByTemplate(organizationId: string, templateId: string): Promise<readonly TemplateAutomationRule[]>;
  /** True when a rule was deleted. */
  delete(organizationId: string, id: string): Promise<boolean>;
}
