import { createHash, randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleCandidates,
  createDrizzleFeedbackRequests,
  createDrizzleInterviewFeedback,
  createDrizzleJobApprovals,
  createDrizzleJobRequests,
  createDrizzleJobs,
  createDrizzleMemberDirectory,
  createDrizzleNotifications,
  createDrizzleOrganizationDirectory,
  createDrizzleOrganizationSettings,
  createDrizzleStageInterviewers,
  createDrizzleStaleJobs,
  type AuditLogRepository,
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
} from '@tt/core';
import type { Db } from '@tt/db';
import { newConversationToken } from '@tt/providers';

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
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  readonly files: FileStorage;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly onFeedbackMailError: (error: unknown) => void;
}

export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** Feedback without login, job requests with approval and stale ads on Postgres; the sender is injected. */
export function createHrDeps({ db, auditLog, files, sender, config, onFeedbackMailError }: HrInputs): HrWiring {
  const jobs = createDrizzleJobs(db);
  const candidates = createDrizzleCandidates(db);
  const applications = createDrizzleApplications(db);
  const organizations = createDrizzleOrganizationDirectory(db);
  const members = createDrizzleMemberDirectory(db);
  const feedbackRecords: FeedbackRecords = { feedbackRequests: createDrizzleFeedbackRequests(db), interviewFeedback: createDrizzleInterviewFeedback(db) };
  const stageInterviewers = createDrizzleStageInterviewers(db);
  const clock = { newId: randomUUID, now: () => new Date() };
  const approvals = createDrizzleJobApprovals(db);
  const organizationSettings = createDrizzleOrganizationSettings(db);
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
    feedbackDeps: { auditLog, jobs, candidates, applications, files, ...stageEntry, ...clock },
    publicFeedbackDeps: { auditLog, jobs, candidates, applications, organizations, files, ...feedbackRecords, hash: hashSecret, ...clock },
    jobRequestDeps: { auditLog, jobs, approvals, organizationSettings, members, notifications: createDrizzleNotifications(db), jobRequests: createDrizzleJobRequests(db), ...clock },
    staleJobDeps: { auditLog, staleJobs: createDrizzleStaleJobs(db), now: clock.now },
  };
}
