import { createHash, randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type FeedbackDeps,
  type FeedbackRecords,
  type FeedbackStageEntryParts,
  type FileStorage,
  type EmailSender,
  type JobApprovalRepository,
  type JobRequestDeps,
  type MessagingConfig,
  type OrganizationSettingsRepository,
  type PublicFeedbackDeps,
  type StaleJobDeps,
} from '@candydati/core';
import { newConversationToken } from '@candydati/providers';

export interface HrWiring {
  readonly feedbackDeps: FeedbackDeps;
  readonly publicFeedbackDeps: PublicFeedbackDeps;
  /** What moving or submitting an application needs to ask interviewers for feedback. */
  readonly stageEntry: FeedbackStageEntryParts;
  readonly feedbackRecords: FeedbackRecords;
  readonly jobRequestDeps: JobRequestDeps;
  readonly staleJobDeps: StaleJobDeps;
  readonly approvals: JobApprovalRepository;
  readonly organizationSettings: OrganizationSettingsRepository;
}

export interface HrInputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly onFeedbackMailError: (error: unknown) => void;
}

export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** Feedback without login, job requests with approval and stale ads on Postgres; the sender is injected. */
export function createHrDeps({ uow, files, sender, config, onFeedbackMailError }: HrInputs): HrWiring {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  const { jobs, candidates, applications, organizations, members, stageInterviewers, approvals, organizationSettings } = r;
  const feedbackRecords: FeedbackRecords = { feedbackRequests: r.feedbackRequests, interviewFeedback: r.interviewFeedback };
  const clock = { newId: randomUUID, now: () => new Date() };
  const stageEntry: FeedbackStageEntryParts = {
    ...feedbackRecords,
    sender,
    config,
    newToken: newConversationToken,
    hash: hashSecret,
    onError: onFeedbackMailError,
    members,
    organizations,
    stageInterviewers,
  };
  return {
    stageEntry,
    feedbackRecords,
    approvals,
    organizationSettings,
    feedbackDeps: { ...core, jobs, candidates, applications, files, ...stageEntry, ...clock },
    publicFeedbackDeps: { ...core, jobs, candidates, applications, organizations, files, ...feedbackRecords, hash: hashSecret, ...clock },
    jobRequestDeps: { ...core, jobs, approvals, organizationSettings, members, notifications: r.notifications, jobRequests: r.jobRequests, ...clock },
    staleJobDeps: { ...core, staleJobs: r.staleJobs, now: clock.now },
  };
}
