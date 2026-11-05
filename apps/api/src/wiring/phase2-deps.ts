import { randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type FeedbackStageEntryParts,
  type ProposalDeps,
  type FileStorage,
  type PrivacyDeps,
  type ReceiptDeps,
  type SubmitApplicationDeps,
  type TaskQueue,
} from '@candydati/core';
import { sniffCv } from '@candydati/providers';

export interface Phase2Deps {
  /** With the move proposals, so a move or a decision drops them and the proposal routes can use the same deps. */
  readonly candidateDeps: ProposalDeps;
  readonly proposalDeps: ProposalDeps;
  readonly privacyDeps: PrivacyDeps;
  readonly submitDeps: SubmitApplicationDeps;
}

export interface Phase2Inputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly receipts: ReceiptDeps;
  readonly feedback: FeedbackStageEntryParts;
}

/** Candidates, privacy notices and the public application: the shared repositories, injected storage and queue. */
export function createPhase2Deps({ uow, files, queue, receipts, feedback }: Phase2Inputs): Phase2Deps {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  const { jobs, organizations, privacyNotices } = r;
  const clock = { newId: randomUUID, now: () => new Date() };
  const candidateDeps: ProposalDeps = {
    ...core,
    jobs,
    candidates: r.candidates,
    applications: r.applications,
    notes: r.notes,
    extractions: r.extractions,
    candidateSearch: r.candidateSearch,
    skillAliases: r.skillAliases,
    users: r.users,
    files,
    messages: r.messages,
    stageEvents: r.stageEvents,
    promises: r.promises,
    queue,
    feedback,
    outbox: r.outbox,
    moveProposals: r.moveProposals,
    members: r.members,
    notifications: r.notifications,
    ...clock,
  };
  return {
    candidateDeps,
    proposalDeps: candidateDeps,
    privacyDeps: { ...core, privacyNotices, organizations, organizationSettings: r.organizationSettings, ...clock },
    submitDeps: {
      organizations,
      jobs,
      privacyNotices,
      intake: r.intake,
      files,
      queue,
      receipts,
      cvSniffer: sniffCv,
      ...clock,
    },
  };
}
