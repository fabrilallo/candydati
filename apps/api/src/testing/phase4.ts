import { randomUUID } from 'node:crypto';
import {
  createDrizzleApplications,
  createDrizzleAuditLog,
  createDrizzleAutomationRules,
  createDrizzleMemberDirectory,
  createDrizzleJobs,
  createDrizzleNotifications,
  createDrizzleOutbox,
  createDrizzleTasks,
  createDrizzleWebhookDeliveries,
  createDrizzleWebhookEndpoints,
  deliverWebhook,
  publishWebhookEvents,
  runAutomations,
  scanDeadlines,
  type Actor,
  type AutomationRunDeps,
  type HostGuard,
  type HttpPoster,
  type ScanDeps,
  type WebhookDeliverDeps,
} from '@tt/core';
import { createFakeEmailIdentity } from '@tt/core/testing';
import { eq, schema } from '@tt/db';
import { createHostGuard } from '@tt/providers';
import { testEnv, type TestApp } from './test-app.js';
import { createMessagingDeps } from '../wiring/messaging-deps.js';

/** What the worker does, driven by hand against the test database: the queue of the app records, these drain it. */
const systemActor = (organizationId: string): Actor => ({ type: 'system', id: 'test-worker', onBehalfOfUserId: null, organizationId, role: 'recruiter' });

export function automationRunDeps(t: TestApp): AutomationRunDeps {
  const { db } = t.handle;
  const auditLog = createDrizzleAuditLog(db);
  const { messagingDeps } = createMessagingDeps({ env: testEnv(), db, auditLog, queue: t.queue, sender: t.emailSender, identity: createFakeEmailIdentity(), onReceiptError: () => undefined });
  return { ...messagingDeps, rules: createDrizzleAutomationRules(db), tasks: createDrizzleTasks(db), notifications: createDrizzleNotifications(db), queue: t.queue };
}

export function scanDeps(t: TestApp): ScanDeps {
  const { db } = t.handle;
  return {
    applications: createDrizzleApplications(db),
    jobs: createDrizzleJobs(db),
    tasks: createDrizzleTasks(db),
    notifications: createDrizzleNotifications(db),
    members: createDrizzleMemberDirectory(db),
    newId: randomUUID,
  };
}

export const scan = (t: TestApp, now: Date) => scanDeadlines(scanDeps(t), { now });

/** Runs every `automation.run` task the app queued since the last drain, like the worker would. */
export async function drainAutomations(t: TestApp): Promise<number> {
  const deps = automationRunDeps(t);
  const seen = drainedCount.get(t) ?? 0;
  const jobs = t.queue.jobs().slice(seen).filter((job) => job.name === 'automation.run');
  drainedCount.set(t, t.queue.jobs().length);
  for (const job of jobs) await runAutomations(deps, systemActor((job.payload as { organizationId: string }).organizationId), job.payload as never);
  return jobs.length;
}
const drainedCount = new WeakMap<TestApp, number>();

export function deliverDeps(t: TestApp, poster: HttpPoster, hostGuard: HostGuard = createHostGuard({ allowPrivate: false })): WebhookDeliverDeps {
  const { db } = t.handle;
  return {
    auditLog: createDrizzleAuditLog(db),
    endpoints: createDrizzleWebhookEndpoints(db),
    deliveries: createDrizzleWebhookDeliveries(db),
    outbox: createDrizzleOutbox(db),
    poster,
    hostGuard,
    newId: randomUUID,
    now: () => new Date(),
  };
}

export async function publishOutbox(t: TestApp): Promise<void> {
  const { db } = t.handle;
  await publishWebhookEvents({ endpoints: createDrizzleWebhookEndpoints(db), outbox: createDrizzleOutbox(db), queue: t.queue, now: () => new Date() }, {});
}

export interface DeliveryJob {
  readonly organizationId: string;
  readonly eventId: string;
  readonly endpointId: string;
}

export const deliveryJobs = (t: TestApp): readonly DeliveryJob[] => t.queue.jobs().filter((job) => job.name === 'webhook.deliver').map((job) => job.payload as DeliveryJob);

export async function deliver(t: TestApp, job: DeliveryJob, poster: HttpPoster, hostGuard?: HostGuard) {
  return deliverWebhook(deliverDeps(t, poster, hostGuard), systemActor(job.organizationId), { ...job, attempt: 1, lastAttempt: true });
}

/** Moves an application's deadline directly in the database: the only way to age one without waiting. */
export async function setResponseDue(t: TestApp, applicationId: string, due: Date | null): Promise<void> {
  await t.handle.db.update(schema.application).set({ responseDueAt: due }).where(eq(schema.application.id, applicationId));
}
