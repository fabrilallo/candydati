import { randomBytes, randomUUID } from 'node:crypto';
import {
  type DrizzleUnitOfWork,
  type AutomationRuleDeps,
  type NotificationDeps,
  type TaskDeps,
  type TaskQueue,
  type WebhookDeps,
} from '@tt/core';
import { WEBHOOK_SECRET_PREFIX } from '@tt/domain';

export interface Phase4Deps {
  readonly notificationDeps: NotificationDeps;
  readonly taskDeps: TaskDeps;
  readonly automationDeps: AutomationRuleDeps;
  readonly webhookDeps: WebhookDeps;
}

export interface Phase4Inputs {
  readonly uow: DrizzleUnitOfWork;
  readonly queue: TaskQueue;
  readonly allowPrivateWebhooks: boolean;
}

const SECRET_BYTES = 32;

/** `whsec_` plus 256 bits from the CSPRNG. */
export const newWebhookSecret = (): string => `${WEBHOOK_SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;

/** Notifications, tasks, automation rules and webhooks on Postgres. */
export function createPhase4Deps({ uow, queue, allowPrivateWebhooks }: Phase4Inputs): Phase4Deps {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  const { jobs, applications, candidates, notifications, users } = r;
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    notificationDeps: { ...core, notifications, applications, candidates, jobs, now: clock.now },
    taskDeps: { ...core, tasks: r.tasks, notifications, applications, candidates, jobs, users, ...clock },
    automationDeps: { ...core, rules: r.rules, jobs, templates: r.templates, users, ...clock },
    webhookDeps: {
      ...core,
      endpoints: r.endpoints,
      deliveries: r.deliveries,
      outbox: r.outbox,
      queue,
      allowPrivateWebhooks,
      newSecret: newWebhookSecret,
      ...clock,
    },
  };
}
