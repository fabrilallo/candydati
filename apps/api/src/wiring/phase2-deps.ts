import { randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type CandidateDeps,
  type FeedbackStageEntryParts,
  type FileStorage,
  type PrivacyDeps,
  type ReceiptDeps,
  type SubmitApplicationDeps,
  type TaskQueue,
} from '@tt/core';
import { sniffCv } from '@tt/providers';

export interface Phase2Deps {
  readonly candidateDeps: CandidateDeps;
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
  const core = { auditLog: r.auditLog, transaction: uow.transaction };
  const { jobs, organizations, privacyNotices } = r;
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    candidateDeps: {
      ...core,
      jobs,
      candidates: r.candidates,
      applications: r.applications,
      notes: r.notes,
      extractions: r.extractions,
      candidateSearch: r.candidateSearch,
      users: r.users,
      files,
      messages: r.messages,
      stageEvents: r.stageEvents,
      promises: r.promises,
      queue,
      feedback,
      outbox: r.outbox,
      ...clock,
    },
    privacyDeps: { ...core, privacyNotices, organizations, ...clock },
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
