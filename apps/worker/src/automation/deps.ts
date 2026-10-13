import { randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleAuditLog,
  createDrizzleAutomationRules,
  createDrizzleCandidates,
  createDrizzleConversations,
  createDrizzleEmailSettings,
  createDrizzleEmailTemplates,
  createDrizzleJobs,
  createDrizzleMemberDirectory,
  createDrizzleMessages,
  createDrizzleNotifications,
  createDrizzleOrganizationDirectory,
  createDrizzleOutbox,
  createDrizzleResponsePromises,
  createDrizzleTasks,
  createDrizzleUserDirectory,
  createDrizzleWebhookDeliveries,
  createDrizzleWebhookEndpoints,
  type AutomationRunDeps,
  type EmailIdentity,
  type EmailSender,
  type ScanDeps,
  type TaskQueue,
  type WebhookDeliverDeps,
  type WebhookPublishDeps,
} from '@tt/core';
import type { Db } from '@tt/db';
import type { PlatformConfig } from '@tt/domain';
import { createHostGuard, createHttpPoster, newConversationToken, toMessagingConfig, type EmailConfig } from '@tt/providers';

export interface AutomationWiring {
  readonly db: Db;
  readonly queue: TaskQueue;
  readonly sender: EmailSender;
  readonly identity: EmailIdentity;
  readonly platform: PlatformConfig;
  readonly email: EmailConfig;
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
  const { db, queue } = wiring;
  const clock = { newId: randomUUID, now: () => new Date() };
  const auditLog = createDrizzleAuditLog(db);
  const jobs = createDrizzleJobs(db);
  const applications = createDrizzleApplications(db);
  const notifications = createDrizzleNotifications(db);
  const tasks = createDrizzleTasks(db);
  const endpoints = createDrizzleWebhookEndpoints(db);
  const outbox = createDrizzleOutbox(db);
  const promises = createDrizzleResponsePromises(db);
  return {
    run: {
      auditLog,
      jobs,
      organizations: createDrizzleOrganizationDirectory(db),
      candidates: createDrizzleCandidates(db),
      applications,
      users: createDrizzleUserDirectory(db),
      templates: createDrizzleEmailTemplates(db),
      settings: createDrizzleEmailSettings(db),
      conversations: createDrizzleConversations(db),
      messages: createDrizzleMessages(db),
      promises,
      queue,
      identity: wiring.identity,
      sender: wiring.sender,
      config: toMessagingConfig(wiring.platform, wiring.email),
      newToken: newConversationToken,
      rules: createDrizzleAutomationRules(db),
      tasks,
      notifications,
      ...clock,
    },
    deliver: {
      auditLog,
      endpoints,
      deliveries: createDrizzleWebhookDeliveries(db),
      outbox,
      poster: createHttpPoster({ timeoutMs: 10_000, allowPrivate: wiring.allowPrivateWebhooks }),
      hostGuard: createHostGuard({ allowPrivate: wiring.allowPrivateWebhooks, production: wiring.production }),
      ...clock,
    },
    publish: { endpoints, outbox, queue, now: clock.now },
    scan: { applications, jobs, promises, tasks, notifications, members: createDrizzleMemberDirectory(db), newId: clock.newId },
  };
}
