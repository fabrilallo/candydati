import { randomUUID } from 'node:crypto';
import {
  createDrizzleApplicationIntake,
  createDrizzleApplications,
  createDrizzleCandidateNotes,
  createDrizzleCandidateSearch,
  createDrizzleCandidates,
  createDrizzleCvExtractions,
  createDrizzleJobs,
  createDrizzleMessages,
  createDrizzleOutbox,
  createDrizzleOrganizationDirectory,
  createDrizzleResponsePromises,
  createDrizzleStageEvents,
  createDrizzlePrivacyNotices,
  createDrizzleUserDirectory,
  type AuditLogRepository,
  type CandidateDeps,
  type FeedbackStageEntryParts,
  type FileStorage,
  type PrivacyDeps,
  type ReceiptDeps,
  type SubmitApplicationDeps,
  type TaskQueue,
} from '@tt/core';
import type { Db } from '@tt/db';
import { sniffCv } from '@tt/providers';

export interface Phase2Deps {
  readonly candidateDeps: CandidateDeps;
  readonly privacyDeps: PrivacyDeps;
  readonly submitDeps: SubmitApplicationDeps;
}

export interface Phase2Inputs {
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly receipts: ReceiptDeps;
  readonly feedback: FeedbackStageEntryParts;
}

/** Candidates, privacy notices and the public application: Drizzle repositories, injected storage and queue. */
export function createPhase2Deps({ db, auditLog, files, queue, receipts, feedback }: Phase2Inputs): Phase2Deps {
  const jobs = createDrizzleJobs(db);
  const organizations = createDrizzleOrganizationDirectory(db);
  const privacyNotices = createDrizzlePrivacyNotices(db);
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    candidateDeps: {
      auditLog,
      jobs,
      candidates: createDrizzleCandidates(db),
      applications: createDrizzleApplications(db),
      notes: createDrizzleCandidateNotes(db),
      extractions: createDrizzleCvExtractions(db),
      candidateSearch: createDrizzleCandidateSearch(db),
      users: createDrizzleUserDirectory(db),
      files,
      messages: createDrizzleMessages(db),
      stageEvents: createDrizzleStageEvents(db),
      promises: createDrizzleResponsePromises(db),
      queue,
      feedback,
      outbox: createDrizzleOutbox(db),
      ...clock,
    },
    privacyDeps: { auditLog, privacyNotices, organizations, ...clock },
    submitDeps: {
      organizations,
      jobs,
      privacyNotices,
      intake: createDrizzleApplicationIntake(db),
      files,
      queue,
      receipts,
      cvSniffer: sniffCv,
      ...clock,
    },
  };
}
