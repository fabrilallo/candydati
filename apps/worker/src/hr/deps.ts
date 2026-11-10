import { createHash, randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type EmailSender,
  type FeedbackStageEntryDeps,
  type InterviewReminderDeps,
  type MessagingConfig,
  type ShortlistReminderDeps,
  type StaleScanDeps,
} from '@candydati/core';
import { newConversationToken } from '@candydati/providers';

export interface HrWorkerDeps {
  readonly feedback: FeedbackStageEntryDeps;
  readonly stale: StaleScanDeps;
  readonly shortlists: ShortlistReminderDeps;
  readonly interviews: InterviewReminderDeps;
}

export interface HrWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  readonly onMailError: (error: unknown) => void;
}

/** What the hourly scan needs for feedback, shortlist and interview reminders and stale ads, on Postgres; the sender is injected. */
export function createHrWorkerDeps({ uow, sender, config, onMailError }: HrWiring): HrWorkerDeps {
  const r = uow.repositories;
  const clock = { newId: randomUUID, now: () => new Date() };
  const hash = (secret: string): string => createHash('sha256').update(secret).digest('hex');
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
      hash,
      onError: onMailError,
      ...clock,
    },
    shortlists: { auditLog: r.auditLog, shortlists: r.shortlists, jobs: r.jobs, clients: r.clients, organizations: r.organizations, sender, config, newToken: newConversationToken, hash, onError: onMailError },
    interviews: { interviews: r.interviews, applications: r.applications, jobs: r.jobs, candidates: r.candidates, organizations: r.organizations, sender, config, onError: onMailError },
    stale: { staleJobs: r.staleJobs, jobs: r.jobs, notifications: r.notifications, members: r.members, jobTeams: r.jobTeams, newId: clock.newId },
  };
}
