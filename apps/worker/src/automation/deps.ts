import type { MessagingConfig } from '@candydati/core';
import { randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type AutomationRunDeps,
  type EmailIdentity,
  type EmailSender,
  type ScanDeps,
  type TaskQueue,
  type WebhookDeliverDeps,
  type WebhookPublishDeps,
} from '@candydati/core';
import type { PlatformConfig } from '@candydati/domain';
import { createHostGuard, createHttpPoster, newConversationToken } from '@candydati/providers';

export interface AutomationWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly queue: TaskQueue;
  readonly sender: EmailSender;
  readonly identity: EmailIdentity;
  readonly platform: PlatformConfig;
  /** Live: the From and Reply-To domains follow the instance email settings. */
  readonly config: MessagingConfig;
  readonly production: boolean;
  readonly allowPrivateWebhooks: boolean;
}

export interface Phase4WorkerDeps {
  readonly run: AutomationRunDeps;
  readonly deliver: WebhookDeliverDeps;
  readonly publish: WebhookPublishDeps;
  readonly scan: ScanDeps;
}

/** Drizzle repositories for the Phase 4 jobs; the queue, the email sender and the identity are injected. */
export function createPhase4WorkerDeps(wiring: AutomationWiring): Phase4WorkerDeps {
  const { uow, queue } = wiring;
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction };
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    run: {
      ...core,
      jobs: r.jobs,
      organizations: r.organizations,
      candidates: r.candidates,
      applications: r.applications,
      users: r.users,
      templates: r.templates,
      settings: r.settings,
      conversations: r.conversations,
      messages: r.messages,
      promises: r.promises,
      queue,
      identity: wiring.identity,
      sender: wiring.sender,
      config: wiring.config,
      newToken: newConversationToken,
      rules: r.rules,
      executions: r.executions,
      tasks: r.tasks,
      notifications: r.notifications,
      members: r.members,
      ...clock,
    },
    deliver: {
      ...core,
      endpoints: r.endpoints,
      deliveries: r.deliveries,
      outbox: r.outbox,
      poster: createHttpPoster({ timeoutMs: 10_000, allowPrivate: wiring.allowPrivateWebhooks }),
      hostGuard: createHostGuard({ allowPrivate: wiring.allowPrivateWebhooks, production: wiring.production }),
      ...clock,
    },
    publish: { endpoints: r.endpoints, outbox: r.outbox, queue, transaction: uow.transaction, now: clock.now },
    scan: { applications: r.applications, jobs: r.jobs, promises: r.promises, tasks: r.tasks, notifications: r.notifications, members: r.members, jobTeams: r.jobTeams, newId: clock.newId },
  };
}
