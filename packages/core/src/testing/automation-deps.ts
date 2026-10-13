import type { AutomationRule, Notification, OutboxEvent, Task, WebhookEndpoint } from '@tt/domain';
import type { AutomationRuleDeps, AutomationRunDeps, NotificationDeps, ScanDeps, TaskDeps, Member } from '../automation-ports.js';
import type { JobDeps } from '../job-ports.js';
import type { WebhookDeliverDeps, WebhookDeps, WebhookPublishDeps } from '../webhook-ports.js';
import { defaultMembers } from './automation-fixtures.js';
import { seedMessagingWorld, type MessagingSeedOptions } from './messaging-deps.js';
import { fakeAdQualityAnalyzer } from './job-fixtures.js';
import {
  createFakeHostGuard,
  createFakeHttpPoster,
  createInMemoryAutomationRules,
  createInMemoryMemberDirectory,
  createInMemoryNotifications,
  createInMemoryTasks,
  createInMemoryWebhookDeliveries,
  createInMemoryWebhookEndpoints,
  type FakeHttpPoster,
  type InMemoryAutomationRules,
  type InMemoryNotifications,
  type InMemoryTasks,
  type InMemoryWebhookDeliveries,
  type InMemoryWebhookEndpoints,
} from './in-memory-automation.js';
import { createInMemoryApplicationCounts, createInMemoryUserDirectory } from './in-memory-candidates.js';
import { createInMemoryJobTemplateRepository } from './in-memory-jobs.js';
import { createInMemoryJobApprovals, createInMemoryOrganizationSettings } from './in-memory-job-requests.js';
import type { TestMessagingDeps } from './messaging-deps.js';
import { ORG_A } from './candidate-seed.js';

export type TestAutomationDeps = TestMessagingDeps &
  AutomationRunDeps &
  NotificationDeps &
  TaskDeps &
  AutomationRuleDeps &
  ScanDeps &
  WebhookDeps &
  WebhookPublishDeps &
  WebhookDeliverDeps &
  JobDeps & {
    readonly notifications: InMemoryNotifications;
    readonly tasks: InMemoryTasks;
    readonly rules: InMemoryAutomationRules;
    readonly endpoints: InMemoryWebhookEndpoints;
    readonly deliveries: InMemoryWebhookDeliveries;
    readonly poster: FakeHttpPoster;
  };

export interface AutomationSeedOptions extends MessagingSeedOptions {
  readonly notifications?: readonly Notification[];
  readonly tasks?: readonly Task[];
  readonly rules?: readonly AutomationRule[];
  readonly endpoints?: readonly WebhookEndpoint[];
  readonly outbox?: readonly OutboxEvent[];
  readonly members?: Readonly<Record<string, readonly Member[]>>;
  readonly automationOverrides?: Partial<TestAutomationDeps>;
}

/**
 * The messaging world (`org_a`, job `job_1` created by `user_test`, one open application `app_1` in `received`) plus every
 * Phase 4 port in memory: notifications, tasks, rules, members (`defaultMembers`), webhook endpoints, outbox and a fake
 * HTTP client. The job-side ports are included so close/update/publish can run on the same world.
 */
export function seedAutomationWorld(options: AutomationSeedOptions = {}): TestAutomationDeps {
  const world = seedMessagingWorld(options);
  const members = options.members ?? { [ORG_A]: defaultMembers };
  const names = Object.fromEntries(Object.values(members).flat().map((m) => [m.userId, m.name]));
  const rules = createInMemoryAutomationRules(options.rules);
  let secretCounter = 0;
  for (const event of options.outbox ?? []) void world.outbox.append(event);
  return {
    ...world,
    users: createInMemoryUserDirectory(names),
    notifications: createInMemoryNotifications(),
    tasks: createInMemoryTasks(options.tasks),
    rules,
    automationRules: rules,
    members: createInMemoryMemberDirectory(members),
    endpoints: createInMemoryWebhookEndpoints(options.endpoints),
    deliveries: createInMemoryWebhookDeliveries(),
    poster: createFakeHttpPoster(),
    hostGuard: createFakeHostGuard(),
    allowPrivateWebhooks: false,
    newSecret: () => {
      secretCounter += 1;
      return `whsec_test_${secretCounter}`;
    },
    jobTemplates: createInMemoryJobTemplateRepository(),
    approvals: createInMemoryJobApprovals(),
    organizationSettings: createInMemoryOrganizationSettings(),
    applicationCounts: createInMemoryApplicationCounts(world.store),
    adQuality: fakeAdQualityAnalyzer(),
    adQualityThreshold: 6,
    ...options.automationOverrides,
  } as TestAutomationDeps;
}

/** Notifications seeded after the world exists (the repository is built by the world itself). */
export async function seedNotifications(deps: TestAutomationDeps, notifications: readonly Notification[]): Promise<void> {
  for (const notification of notifications) await deps.notifications.createIfAbsent(notification, notification.id);
}
