import type { AutomationRule, Notification, OutboxEvent, Task, WebhookDelivery, WebhookEndpoint } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type {
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
  OutboxRepository,
  WebhookDeliveryRepository,
  WebhookEndpointRepository,
} from '../webhook-ports.js';

const sameKey = (a: { organizationId: string; id: string }, b: { organizationId: string; id: string }) =>
  a.organizationId === b.organizationId && a.id === b.id;
const newestFirst = <T extends { createdAt: Date }>(items: readonly T[]): readonly T[] =>
  items.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

export interface InMemoryNotifications extends NotificationRepository {
  snapshot(): readonly Notification[];
  /** Test double of the erasure: drops the rows `doomed` accepts. */
  purge(doomed: (notification: Notification) => boolean): void;
}

export function createInMemoryNotifications(initial: readonly Notification[] = []): InMemoryNotifications {
  let rows: readonly Notification[] = [...initial];
  let keys: ReadonlySet<string> = new Set();
  const own = (organizationId: string, userId: string) => rows.filter((n) => n.organizationId === organizationId && n.userId === userId);
  return {
    async createIfAbsent(notification, dedupeKey) {
      const key = `${notification.organizationId}|${notification.userId}|${dedupeKey}`;
      if (keys.has(key)) return null;
      keys = new Set([...keys, key]);
      rows = [...rows, notification];
      return notification;
    },
    async list(query) {
      const matching = newestFirst(own(query.organizationId, query.userId).filter((n) => !query.unreadOnly || n.readAt === null));
      const start = (query.page - 1) * query.limit;
      return { items: matching.slice(start, start + query.limit), total: matching.length };
    },
    async markRead(organizationId, userId, ids, at) {
      const targets = own(organizationId, userId).filter((n) => n.readAt === null && (ids === undefined || ids.includes(n.id)));
      const targetIds = new Set(targets.map((n) => n.id));
      rows = rows.map((n) => (targetIds.has(n.id) && n.organizationId === organizationId ? { ...n, readAt: at } : n));
      return targets.length;
    },
    async unreadCount(organizationId, userId) {
      return own(organizationId, userId).filter((n) => n.readAt === null).length;
    },
    snapshot: () => rows,
    purge(doomed) {
      rows = rows.filter((n) => !doomed(n));
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
  let rows: readonly Task[] = [...initial];
  const inOrg = (organizationId: string) => rows.filter((t) => t.organizationId === organizationId);
  return {
    async create(task) {
      rows = [...rows, task];
      return task;
    },
    async save(task) {
      rows = rows.map((t) => (sameKey(t, task) ? task : t));
      return task;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((t) => t.id === id) ?? null;
    },
    async list(query) {
      return inOrg(query.organizationId)
        .filter((t) => query.assigneeId === undefined || t.assigneeId === query.assigneeId)
        .filter((t) => !query.openOnly || t.completedAt === null)
        .toSorted(taskOrder)
        .slice(0, query.limit);
    },
    async listByApplication(organizationId, applicationId) {
      return inOrg(organizationId).filter((t) => t.applicationId === applicationId).toSorted(taskOrder);
    },
    async listOpenDueAcrossOrganizations(dueBefore) {
      return rows.filter((t) => t.completedAt === null && t.dueAt !== null && t.dueAt <= dueBefore);
    },
    snapshot: () => rows,
    purge(doomed) {
      rows = rows.filter((t) => !doomed(t));
    },
  };
}

export interface InMemoryAutomationRules extends AutomationRuleRepository {
  snapshot(): readonly AutomationRule[];
}

export function createInMemoryAutomationRules(initial: readonly AutomationRule[] = []): InMemoryAutomationRules {
  let rows: readonly AutomationRule[] = [...initial];
  const inOrg = (organizationId: string) => rows.filter((r) => r.organizationId === organizationId);
  const oldestFirst = (items: readonly AutomationRule[]) => items.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    async create(rule) {
      rows = [...rows, rule];
      return rule;
    },
    async save(rule) {
      rows = rows.map((r) => (sameKey(r, rule) ? rule : r));
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
      rows = rows.filter((r) => !(r.organizationId === organizationId && r.id === id));
      return exists;
    },
    async deleteByStages(organizationId, jobId, stageIds) {
      const doomed = inOrg(organizationId).filter((r) => r.jobId === jobId && stageIds.includes(r.stageId));
      rows = rows.filter((r) => !doomed.includes(r));
      return doomed.length;
    },
    snapshot: () => rows,
  };
}

export const createInMemoryMemberDirectory = (membersByOrganization: Readonly<Record<string, readonly Member[]>> = {}): MemberDirectory => ({
  async list(organizationId) {
    return membersByOrganization[organizationId] ?? [];
  },
});

export interface InMemoryOutbox extends OutboxRepository {
  snapshot(): readonly OutboxEvent[];
  purge(doomed: (event: OutboxEvent) => boolean): void;
}

export function createInMemoryOutbox(initial: readonly OutboxEvent[] = []): InMemoryOutbox {
  let rows: readonly OutboxEvent[] = [...initial];
  return {
    async append(event) {
      if (rows.some((e) => sameKey(e, event))) throw new ConflictError('Event already stored.');
      rows = [...rows, event];
      return event;
    },
    async findById(organizationId, id) {
      return rows.find((e) => e.organizationId === organizationId && e.id === id) ?? null;
    },
    async listUnpublished(limit) {
      return rows.filter((e) => e.publishedAt === null).slice(0, limit);
    },
    async markPublished(organizationId, id, at) {
      rows = rows.map((e) => (e.organizationId === organizationId && e.id === id ? { ...e, publishedAt: at } : e));
    },
    snapshot: () => rows,
    purge(doomed) {
      rows = rows.filter((e) => !doomed(e));
    },
  };
}

export interface InMemoryWebhookEndpoints extends WebhookEndpointRepository {
  snapshot(): readonly WebhookEndpoint[];
}

export function createInMemoryWebhookEndpoints(initial: readonly WebhookEndpoint[] = []): InMemoryWebhookEndpoints {
  let rows: readonly WebhookEndpoint[] = [...initial];
  const inOrg = (organizationId: string) => rows.filter((e) => e.organizationId === organizationId);
  return {
    async create(endpoint) {
      rows = [...rows, endpoint];
      return endpoint;
    },
    async save(endpoint) {
      rows = rows.map((e) => (sameKey(e, endpoint) ? endpoint : e));
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
      rows = rows.filter((e) => !(e.organizationId === organizationId && e.id === id));
      return exists;
    },
    snapshot: () => rows,
  };
}

export interface InMemoryWebhookDeliveries extends WebhookDeliveryRepository {
  snapshot(): readonly WebhookDelivery[];
  purge(doomed: (delivery: WebhookDelivery) => boolean): void;
}

export function createInMemoryWebhookDeliveries(): InMemoryWebhookDeliveries {
  let rows: readonly WebhookDelivery[] = [];
  return {
    async append(delivery) {
      rows = [...rows, delivery];
      return delivery;
    },
    async listByEndpoint(organizationId, endpointId, limit) {
      return newestFirst(rows.filter((d) => d.organizationId === organizationId && d.endpointId === endpointId)).slice(0, limit);
    },
    snapshot: () => rows,
    purge(doomed) {
      rows = rows.filter((d) => !doomed(d));
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
