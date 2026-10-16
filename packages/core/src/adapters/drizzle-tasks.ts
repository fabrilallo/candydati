import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, schema, sql } from '@candydati/db';
import type { Task } from '@candydati/domain';
import type { TaskRepository } from '../automation-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.task.$inferSelect;

const toTask = (row: Row): Task => ({ ...row });

/** Postgres implementation. Every statement filters by `organization_id`, except the explicit cross-organization scan. */
export function createDrizzleTasks(db: DbExecutor): TaskRepository {
  const { task } = schema;
  return {
    async create(value) {
      const [row] = await db.insert(task).values(value).returning();
      if (!row) throw new Error('task insert returned no row');
      return toTask(row);
    },
    async save(value) {
      const { id, organizationId, ...rest } = value;
      const [row] = await db.update(task).set(rest).where(and(eq(task.organizationId, organizationId), eq(task.id, id))).returning();
      if (!row) throw new Error('task not found for save');
      return toTask(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(task).where(and(eq(task.organizationId, organizationId), eq(task.id, id))).limit(1);
      return row ? toTask(row) : null;
    },
    async list(query) {
      const rows = await db
        .select()
        .from(task)
        .where(
          and(
            eq(task.organizationId, query.organizationId),
            ...(query.assigneeId === undefined ? [] : [eq(task.assigneeId, query.assigneeId)]),
            ...(query.openOnly ? [isNull(task.completedAt)] : []),
            ...(query.jobIds === undefined ? [] : [or(isNull(task.jobId), inArray(task.jobId, [...query.jobIds]))]),
          ),
        )
        .orderBy(sql`${task.completedAt} is not null`, sql`${task.dueAt} asc nulls last`, desc(task.createdAt), asc(task.id))
        .limit(query.limit);
      return rows.map(toTask);
    },
    async listByApplication(organizationId, applicationId) {
      const rows = await db
        .select()
        .from(task)
        .where(and(eq(task.organizationId, organizationId), eq(task.applicationId, applicationId)))
        .orderBy(sql`${task.completedAt} is not null`, sql`${task.dueAt} asc nulls last`, desc(task.createdAt), asc(task.id));
      return rows.map(toTask);
    },
    async listOpenDueAcrossOrganizations(dueBefore) {
      const rows = await db
        .select()
        .from(task)
        .where(and(isNull(task.completedAt), isNotNull(task.dueAt), lte(task.dueAt, dueBefore)))
        .orderBy(asc(task.dueAt), asc(task.id));
      return rows.map(toTask);
    },
  };
}
