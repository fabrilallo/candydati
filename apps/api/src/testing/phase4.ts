import { randomUUID } from 'node:crypto';
import {
  createDrizzleUnitOfWork,
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
} from '@candydati/core';
import { createFakeEmailIdentity } from '@candydati/core/testing';
import { eq, schema } from '@candydati/db';
import { createHostGuard } from '@candydati/providers';
import { testEnv, type TestApp } from './test-app.js';
import { createMessagingDeps } from '../wiring/messaging-deps.js';

/** What the worker does, driven by hand against the test database: the queue of the app records, these drain it. */
const systemActor = (organizationId: string): Actor => ({ type: 'system', id: 'test-worker', onBehalfOfUserId: null, organizationId, role: 'recruiter' });

export function automationRunDeps(t: TestApp): AutomationRunDeps {
  const uow = createDrizzleUnitOfWork(t.handle.db);
  const r = uow.repositories;
  const { messagingDeps } = createMessagingDeps({ env: testEnv(), uow, queue: t.queue, sender: t.emailSender, identity: createFakeEmailIdentity(), onReceiptError: () => undefined });
  return { ...messagingDeps, rules: r.rules, executions: r.executions, tasks: r.tasks, notifications: r.notifications, members: r.members, queue: t.queue };
}

export function scanDeps(t: TestApp): ScanDeps {
  const r = createDrizzleUnitOfWork(t.handle.db).repositories;
  return {
    applications: r.applications,
    jobs: r.jobs,
    promises: r.promises,
    tasks: r.tasks,
    notifications: r.notifications,
    members: r.members,
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
  const uow = createDrizzleUnitOfWork(t.handle.db);
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    endpoints: r.endpoints,
    deliveries: r.deliveries,
    outbox: r.outbox,
    poster,
    hostGuard,
    newId: randomUUID,
    now: () => new Date(),
  };
}

export async function publishOutbox(t: TestApp): Promise<void> {
  const uow = createDrizzleUnitOfWork(t.handle.db);
  const r = uow.repositories;
  await publishWebhookEvents({ endpoints: r.endpoints, outbox: r.outbox, queue: t.queue, transaction: uow.transaction, now: () => new Date() }, {});
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
