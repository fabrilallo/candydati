import type { AutomationRule, Notification, Task, WebhookDelivery, WebhookEndpoint } from '@candydati/domain';
import type {
  AutomationExecution,
  AutomationExecutionRepository,
  AutomationRuleRepository,
  Member,
  MemberDirectory,
  NotificationRepository,
  TaskRepository,
} from '../automation-ports.js';
import type {
  HostGuard,
  HttpPoster,
  HttpPostRequest,
  HttpPostResult,
  WebhookDeliveryRepository,
  WebhookEndpointRepository,
} from '../webhook-ports.js';
import { cell } from './in-memory-transaction.js';

const sameKey = (a: { organizationId: string; id: string }, b: { organizationId: string; id: string }) =>
  a.organizationId === b.organizationId && a.id === b.id;
const newestFirst = <T extends { createdAt: Date }>(items: readonly T[]): readonly T[] =>
  items.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

export interface InMemoryNotifications extends NotificationRepository {
  snapshot(): readonly Notification[];
  /** Test double of the erasure: drops the rows `doomed` accepts. */
  purge(doomed: (notification: Notification) => boolean): void;
}

/** Rows about no job pass; rows about a job pass only when it is listed (absent list: everything passes). */
const inJobs = (jobId: string | null, jobIds: readonly string[] | undefined): boolean => jobIds === undefined || jobId === null || jobIds.includes(jobId);

export function createInMemoryNotifications(initial: readonly Notification[] = []): InMemoryNotifications {
  const rows = cell<readonly Notification[]>([...initial]);
  const keys = cell<ReadonlySet<string>>(new Set());
  const emailed = cell<ReadonlySet<string>>(new Set());
  const own = (organizationId: string, userId: string) => rows.get().filter((n) => n.organizationId === organizationId && n.userId === userId);
  return {
    async createIfAbsent(notification, dedupeKey) {
      const key = `${notification.organizationId}|${notification.userId}|${dedupeKey}`;
      if (keys.get().has(key)) return null;
      keys.set(new Set([...keys.get(), key]));
      rows.set([...rows.get(), notification]);
      return notification;
    },
    async list(query) {
      const matching = newestFirst(
        own(query.organizationId, query.userId).filter((n) => (!query.unreadOnly || n.readAt === null) && inJobs(n.jobId, query.jobIds)),
      );
      const start = (query.page - 1) * query.limit;
      return { items: matching.slice(start, start + query.limit), total: matching.length };
    },
    async markRead(organizationId, userId, ids, at) {
      const targets = own(organizationId, userId).filter((n) => n.readAt === null && (ids === undefined || ids.includes(n.id)));
      const targetIds = new Set(targets.map((n) => n.id));
      rows.set(rows.get().map((n) => (targetIds.has(n.id) && n.organizationId === organizationId ? { ...n, readAt: at } : n)));
      return targets.length;
    },
    async unreadCount(organizationId, userId, jobIds) {
      return own(organizationId, userId).filter((n) => n.readAt === null && inJobs(n.jobId, jobIds)).length;
    },
    async listUnemailed(kinds, since) {
      return rows.get().filter((n) => kinds.includes(n.kind) && n.createdAt >= since && !emailed.get().has(n.id));
    },
    async markEmailed(organizationId, ids, _at) {
      const targets = rows.get().filter((n) => n.organizationId === organizationId && ids.includes(n.id) && !emailed.get().has(n.id));
      emailed.set(new Set([...emailed.get(), ...targets.map((n) => n.id)]));
      return targets.map((n) => n.id);
    },
    snapshot: () => rows.get(),
    purge(doomed) {
      rows.set(rows.get().filter((n) => !doomed(n)));
    },
  };
}

export interface InMemoryTasks extends TaskRepository {
  snapshot(): readonly Task[];
  purge(doomed: (task: Task) => boolean): void;
}

const taskOrder = (a: Task, b: Task): number =>
  Number(a.completedAt !== null) - Number(b.completedAt !== null) ||
  (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
  b.createdAt.getTime() - a.createdAt.getTime();

export function createInMemoryTasks(initial: readonly Task[] = []): InMemoryTasks {
  const rows = cell<readonly Task[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((t) => t.organizationId === organizationId);
  return {
    async create(task) {
      rows.set([...rows.get(), task]);
      return task;
    },
    async save(task) {
      rows.set(rows.get().map((t) => (sameKey(t, task) ? task : t)));
      return task;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((t) => t.id === id) ?? null;
    },
    async list(query) {
      return inOrg(query.organizationId)
        .filter((t) => query.assigneeId === undefined || t.assigneeId === query.assigneeId)
        .filter((t) => !query.openOnly || t.completedAt === null)
        .filter((t) => inJobs(t.jobId, query.jobIds))
        .toSorted(taskOrder)
        .slice(0, query.limit);
    },
    async listByApplication(organizationId, applicationId) {
      return inOrg(organizationId).filter((t) => t.applicationId === applicationId).toSorted(taskOrder);
    },
    async listOpenDueAcrossOrganizations(dueBefore) {
      return rows.get().filter((t) => t.completedAt === null && t.dueAt !== null && t.dueAt <= dueBefore);
    },
    snapshot: () => rows.get(),
    purge(doomed) {
      rows.set(rows.get().filter((t) => !doomed(t)));
    },
  };
}

export interface InMemoryAutomationRules extends AutomationRuleRepository {
  snapshot(): readonly AutomationRule[];
}

export interface InMemoryAutomationExecutions extends AutomationExecutionRepository {
  snapshot(): readonly AutomationExecution[];
}

export function createInMemoryAutomationExecutions(): InMemoryAutomationExecutions {
  const rows = cell<readonly AutomationExecution[]>([]);
  const entryOf = (e: AutomationExecution) => `${e.ruleId}|${e.applicationId}|${e.stageId}|${e.stageEnteredAt.toISOString()}`;
  return {
    async claim(execution) {
      if (rows.get().some((row) => entryOf(row) === entryOf(execution))) return false;
      rows.set([...rows.get(), execution]);
      return true;
    },
    snapshot: () => rows.get(),
  };
}

export function createInMemoryAutomationRules(initial: readonly AutomationRule[] = []): InMemoryAutomationRules {
  const rows = cell<readonly AutomationRule[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((r) => r.organizationId === organizationId);
  const oldestFirst = (items: readonly AutomationRule[]) => items.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    async create(rule) {
      rows.set([...rows.get(), rule]);
      return rule;
    },
    async save(rule) {
      rows.set(rows.get().map((r) => (sameKey(r, rule) ? rule : r)));
      return rule;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((r) => r.id === id) ?? null;
    },
    async listByJob(organizationId, jobId) {
      return oldestFirst(inOrg(organizationId).filter((r) => r.jobId === jobId));
    },
    async listEnabledByStage(organizationId, jobId, stageId) {
      return oldestFirst(inOrg(organizationId).filter((r) => r.jobId === jobId && r.stageId === stageId && r.enabled));
    },
    async delete(organizationId, id) {
      const exists = inOrg(organizationId).some((r) => r.id === id);
      rows.set(rows.get().filter((r) => !(r.organizationId === organizationId && r.id === id)));
      return exists;
    },
    async deleteByStages(organizationId, jobId, stageIds) {
      const doomed = inOrg(organizationId).filter((r) => r.jobId === jobId && stageIds.includes(r.stageId));
      rows.set(rows.get().filter((r) => !doomed.includes(r)));
      return doomed.length;
    },
    snapshot: () => rows.get(),
  };
}

export const createInMemoryMemberDirectory = (membersByOrganization: Readonly<Record<string, readonly Member[]>> = {}): MemberDirectory => ({
  async list(organizationId) {
    return membersByOrganization[organizationId] ?? [];
  },
});

export { createInMemoryOutbox, type InMemoryOutbox } from './in-memory-outbox.js';

export interface InMemoryWebhookEndpoints extends WebhookEndpointRepository {
  snapshot(): readonly WebhookEndpoint[];
}

export function createInMemoryWebhookEndpoints(initial: readonly WebhookEndpoint[] = []): InMemoryWebhookEndpoints {
  const rows = cell<readonly WebhookEndpoint[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((e) => e.organizationId === organizationId);
  return {
    async create(endpoint) {
      rows.set([...rows.get(), endpoint]);
      return endpoint;
    },
    async save(endpoint) {
      rows.set(rows.get().map((e) => (sameKey(e, endpoint) ? endpoint : e)));
      return endpoint;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((e) => e.id === id) ?? null;
    },
    async list(organizationId) {
      return newestFirst(inOrg(organizationId));
    },
    async listForEvent(organizationId, type) {
      return inOrg(organizationId).filter((e) => e.enabled && e.events.includes(type));
    },
    async delete(organizationId, id) {
      const exists = inOrg(organizationId).some((e) => e.id === id);
      rows.set(rows.get().filter((e) => !(e.organizationId === organizationId && e.id === id)));
      return exists;
    },
    snapshot: () => rows.get(),
  };
}

export interface InMemoryWebhookDeliveries extends WebhookDeliveryRepository {
  snapshot(): readonly WebhookDelivery[];
  purge(doomed: (delivery: WebhookDelivery) => boolean): void;
}

export function createInMemoryWebhookDeliveries(): InMemoryWebhookDeliveries {
  const rows = cell<readonly WebhookDelivery[]>([]);
  return {
    async append(delivery) {
      rows.set([...rows.get(), delivery]);
      return delivery;
    },
    async hasSucceeded(organizationId, endpointId, eventId) {
      return rows.get().some((d) => d.organizationId === organizationId && d.endpointId === endpointId && d.eventId === eventId && d.status === 'success');
    },
    async listByEndpoint(organizationId, endpointId, limit) {
      return newestFirst(rows.get().filter((d) => d.organizationId === organizationId && d.endpointId === endpointId)).slice(0, limit);
    },
    async prune(before) {
      const kept = rows.get().filter((d) => d.createdAt >= before);
      const removed = rows.get().length - kept.length;
      rows.set(kept);
      return removed;
    },
    snapshot: () => rows.get(),
    purge(doomed) {
      rows.set(rows.get().filter((d) => !doomed(d)));
    },
  };
}

export interface FakeHttpPoster extends HttpPoster {
  requests(): readonly HttpPostRequest[];
}

/** Answers `result` for every request (default 200), or throws when it is an Error. */
export function createFakeHttpPoster(result: HttpPostResult | Error = { ok: true, status: 200 }): FakeHttpPoster {
  let requests: readonly HttpPostRequest[] = [];
  return {
    async post(request) {
      requests = [...requests, request];
      if (result instanceof Error) throw result;
      return result;
    },
    requests: () => requests,
  };
}

export const createFakeHostGuard = (allowed = true): HostGuard & { readonly asked: () => readonly string[] } => {
  let asked: readonly string[] = [];
  return {
    async isAllowed(url) {
      asked = [...asked, url];
      return allowed;
    },
    asked: () => asked,
  };
};
