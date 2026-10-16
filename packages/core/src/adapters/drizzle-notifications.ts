import { and, asc, count, desc, eq, gte, inArray, isNull, or, schema } from '@candydati/db';
import type { Notification } from '@candydati/domain';
import type { NotificationRepository } from '../automation-ports.js';
import type { DbExecutor } from './db-executor.js';
import { sequential } from '../sequential.js';

type Row = typeof schema.notification.$inferSelect;

const toNotification = (row: Row): Notification => ({
  id: row.id,
  organizationId: row.organizationId,
  userId: row.userId,
  kind: row.kind,
  applicationId: row.applicationId,
  jobId: row.jobId,
  taskId: row.taskId,
  payload: row.payload,
  createdAt: row.createdAt,
  readAt: row.readAt,
});

/** Per-job access: notifications about no job, or about one of `jobIds`. Absent: no filter. */
const inJobs = (jobIds: readonly string[] | undefined) =>
  jobIds === undefined ? undefined : or(isNull(schema.notification.jobId), inArray(schema.notification.jobId, [...jobIds]));

/** Postgres implementation. Every statement filters by organization and user. */
export function createDrizzleNotifications(db: DbExecutor): NotificationRepository {
  const { notification } = schema;
  const own = (organizationId: string, userId: string) => [eq(notification.organizationId, organizationId), eq(notification.userId, userId)];
  return {
    async createIfAbsent(value, dedupeKey) {
      const [row] = await db
        .insert(notification)
        .values({ ...value, dedupeKey })
        .onConflictDoNothing({ target: [notification.organizationId, notification.userId, notification.dedupeKey] })
        .returning();
      return row ? toNotification(row) : null;
    },
    async list(query) {
      const where = and(...own(query.organizationId, query.userId), ...(query.unreadOnly ? [isNull(notification.readAt)] : []), inJobs(query.jobIds));
      const [items, totals] = await sequential(
        () =>
          db
            .select()
            .from(notification)
            .where(where)
            .orderBy(desc(notification.createdAt), desc(notification.id))
            .limit(query.limit)
            .offset((query.page - 1) * query.limit),
        () => db.select({ total: count() }).from(notification).where(where),
      );
      return { items: items.map(toNotification), total: totals[0]?.total ?? 0 };
    },
    async markRead(organizationId, userId, ids, at) {
      if (ids !== undefined && ids.length === 0) return 0;
      const rows = await db
        .update(notification)
        .set({ readAt: at })
        .where(and(...own(organizationId, userId), isNull(notification.readAt), ...(ids ? [inArray(notification.id, [...ids])] : [])))
        .returning({ id: notification.id });
      return rows.length;
    },
    async listUnemailed(kinds, since) {
      if (kinds.length === 0) return [];
      const rows = await db
        .select()
        .from(notification)
        .where(and(isNull(notification.emailedAt), inArray(notification.kind, [...kinds]), gte(notification.createdAt, since)))
        .orderBy(asc(notification.createdAt), asc(notification.id));
      return rows.map(toNotification);
    },
    async markEmailed(organizationId, ids, at) {
      if (ids.length === 0) return [];
      const rows = await db
        .update(notification)
        .set({ emailedAt: at })
        .where(and(eq(notification.organizationId, organizationId), isNull(notification.emailedAt), inArray(notification.id, [...ids])))
        .returning({ id: notification.id });
      return rows.map((row) => row.id);
    },
    async unreadCount(organizationId, userId, jobIds) {
      const [row] = await db
        .select({ total: count() })
        .from(notification)
        .where(and(...own(organizationId, userId), isNull(notification.readAt), inJobs(jobIds)));
      return row?.total ?? 0;
    },
  };
}
