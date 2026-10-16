import type { AutomationRule, Notification, OutboxEvent, Task, WebhookDelivery, WebhookEndpoint } from '@candydati/domain';
import type { Member } from '../automation-ports.js';

const DATE = new Date('2026-01-01T00:00:00.000Z');

export const buildTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task_1',
  organizationId: 'org_a',
  applicationId: 'app_1',
  jobId: 'job_1',
  title: 'Call the candidate',
  assigneeId: 'user_test',
  dueAt: null,
  createdBy: 'recruiter_1',
  createdAt: DATE,
  completedAt: null,
  ...overrides,
});

export const buildNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notif_1',
  organizationId: 'org_a',
  userId: 'user_test',
  kind: 'response_overdue',
  applicationId: 'app_1',
  jobId: 'job_1',
  taskId: null,
  payload: {},
  createdAt: DATE,
  readAt: null,
  ...overrides,
});

export const buildAutomationRule = (overrides: Partial<AutomationRule> = {}): AutomationRule => ({
  id: 'rule_1',
  organizationId: 'org_a',
  jobId: 'job_1',
  stageId: 'stage-0',
  action: { type: 'create_task', title: 'Prepare the interview', assignee: 'job_owner' },
  enabled: true,
  createdBy: 'recruiter_1',
  createdAt: DATE,
  ...overrides,
});

export const buildWebhookEndpoint = (overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint => ({
  id: 'hook_1',
  organizationId: 'org_a',
  url: 'https://hooks.example.com/candydati',
  secret: 'whsec_test_secret',
  events: ['application.received', 'application.moved', 'application.decided', 'job.published', 'job.closed'],
  enabled: true,
  createdAt: DATE,
  ...overrides,
});

export const buildOutboxEvent = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id: 'evt_1',
  organizationId: 'org_a',
  type: 'application.received',
  data: { applicationId: 'app_1', jobId: 'job_1' },
  occurredAt: DATE,
  publishedAt: null,
  ...overrides,
});

export const buildWebhookDelivery = (overrides: Partial<WebhookDelivery> = {}): WebhookDelivery => ({
  id: 'del_1',
  organizationId: 'org_a',
  endpointId: 'hook_1',
  eventId: 'evt_1',
  eventType: 'application.received',
  status: 'success',
  responseCode: 200,
  attempt: 1,
  error: null,
  createdAt: DATE,
  ...overrides,
});

/** `org_a`: owner `user_test` (the creator of `job_1`), an admin, a recruiter and a hiring manager. */
export const defaultMembers: readonly Member[] = [
  { userId: 'user_test', name: 'Olivia Owner', email: 'olivia@acme.example', roles: ['owner'] },
  { userId: 'admin_1', name: 'Adam Admin', email: 'adam@acme.example', roles: ['admin'] },
  { userId: 'recruiter_1', name: 'Rita Recruiter', email: 'rita@acme.example', roles: ['recruiter'] },
  { userId: 'hm_1', name: 'Hugo Manager', email: 'hugo@acme.example', roles: ['hiring_manager'] },
];
