import { createHash, randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type EmailSender,
  type FeedbackStageEntryDeps,
  type MessagingConfig,
  type StaleScanDeps,
} from '@tt/core';
import { newConversationToken } from '@tt/providers';

export interface HrWorkerDeps {
  readonly feedback: FeedbackStageEntryDeps;
  readonly stale: StaleScanDeps;
}

export interface HrWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly onMailError: (error: unknown) => void;
}

/** What the hourly scan needs for feedback reminders and stale ads, on Postgres; the sender is injected. */
export function createHrWorkerDeps({ uow, sender, config, onMailError }: HrWiring): HrWorkerDeps {
  const r = uow.repositories;
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    feedback: {
      auditLog: r.auditLog,
      jobs: r.jobs,
      candidates: r.candidates,
      applications: r.applications,
      organizations: r.organizations,
      members: r.members,
      stageInterviewers: r.stageInterviewers,
      feedbackRequests: r.feedbackRequests,
      interviewFeedback: r.interviewFeedback,
      sender,
      config,
      newToken: newConversationToken,
      hash: (secret) => createHash('sha256').update(secret).digest('hex'),
      onError: onMailError,
      ...clock,
    },
    stale: { staleJobs: r.staleJobs, jobs: r.jobs, notifications: r.notifications, members: r.members, newId: clock.newId },
  };
}
