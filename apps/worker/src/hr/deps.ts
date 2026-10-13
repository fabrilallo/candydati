import { createHash, randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleAuditLog,
  createDrizzleCandidates,
  createDrizzleFeedbackRequests,
  createDrizzleInterviewFeedback,
  createDrizzleJobs,
  createDrizzleMemberDirectory,
  createDrizzleNotifications,
  createDrizzleOrganizationDirectory,
  createDrizzleStageInterviewers,
  createDrizzleStaleJobs,
  type EmailSender,
  type FeedbackStageEntryDeps,
  type MessagingConfig,
  type StaleScanDeps,
} from '@tt/core';
import type { Db } from '@tt/db';
import { newConversationToken } from '@tt/providers';

export interface HrWorkerDeps {
  readonly feedback: FeedbackStageEntryDeps;
  readonly stale: StaleScanDeps;
}

export interface HrWiring {
  readonly db: Db;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly onMailError: (error: unknown) => void;
}

/** What the hourly scan needs for feedback reminders and stale ads, on Postgres; the sender is injected. */
export function createHrWorkerDeps({ db, sender, config, onMailError }: HrWiring): HrWorkerDeps {
  const members = createDrizzleMemberDirectory(db);
  const jobs = createDrizzleJobs(db);
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    feedback: {
      auditLog: createDrizzleAuditLog(db),
      jobs,
      candidates: createDrizzleCandidates(db),
      applications: createDrizzleApplications(db),
      organizations: createDrizzleOrganizationDirectory(db),
      members,
      stageInterviewers: createDrizzleStageInterviewers(db),
      feedbackRequests: createDrizzleFeedbackRequests(db),
      interviewFeedback: createDrizzleInterviewFeedback(db),
      sender,
      config,
      newToken: newConversationToken,
      hash: (secret) => createHash('sha256').update(secret).digest('hex'),
      onError: onMailError,
      ...clock,
    },
    stale: { staleJobs: createDrizzleStaleJobs(db), jobs, notifications: createDrizzleNotifications(db), members, newId: clock.newId },
  };
}
