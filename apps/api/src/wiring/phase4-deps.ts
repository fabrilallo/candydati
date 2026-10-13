import { randomBytes, randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleAutomationRules,
  createDrizzleCandidates,
  createDrizzleEmailTemplates,
  createDrizzleJobs,
  createDrizzleNotifications,
  createDrizzleOutbox,
  createDrizzleTasks,
  createDrizzleUserDirectory,
  createDrizzleWebhookDeliveries,
  createDrizzleWebhookEndpoints,
  type AuditLogRepository,
  type AutomationRuleDeps,
  type NotificationDeps,
  type TaskDeps,
  type TaskQueue,
  type WebhookDeps,
} from '@tt/core';
import type { Db } from '@tt/db';
import { WEBHOOK_SECRET_PREFIX } from '@tt/domain';

export interface Phase4Deps {
  readonly notificationDeps: NotificationDeps;
  readonly taskDeps: TaskDeps;
  readonly automationDeps: AutomationRuleDeps;
  readonly webhookDeps: WebhookDeps;
}

export interface Phase4Inputs {
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  readonly queue: TaskQueue;
  readonly allowPrivateWebhooks: boolean;
}

const SECRET_BYTES = 32;

/** `whsec_` plus 256 bits from the CSPRNG. */
export const newWebhookSecret = (): string => `${WEBHOOK_SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;

/** Notifications, tasks, automation rules and webhooks on Postgres. */
export function createPhase4Deps({ db, auditLog, queue, allowPrivateWebhooks }: Phase4Inputs): Phase4Deps {
  const jobs = createDrizzleJobs(db);
  const applications = createDrizzleApplications(db);
  const candidates = createDrizzleCandidates(db);
  const notifications = createDrizzleNotifications(db);
  const users = createDrizzleUserDirectory(db);
  const clock = { newId: randomUUID, now: () => new Date() };
  return {
    notificationDeps: { auditLog, notifications, applications, candidates, jobs, now: clock.now },
    taskDeps: { auditLog, tasks: createDrizzleTasks(db), notifications, applications, candidates, jobs, users, ...clock },
    automationDeps: { auditLog, rules: createDrizzleAutomationRules(db), jobs, templates: createDrizzleEmailTemplates(db), users, ...clock },
    webhookDeps: {
      auditLog,
      endpoints: createDrizzleWebhookEndpoints(db),
      deliveries: createDrizzleWebhookDeliveries(db),
      outbox: createDrizzleOutbox(db),
      queue,
      allowPrivateWebhooks,
      newSecret: newWebhookSecret,
      ...clock,
    },
  };
}
