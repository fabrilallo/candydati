import { and, asc, eq, isNull, lt, schema } from '@tt/db';
import type { ResponsePromise, StageEvent } from '@tt/domain';
import type { ResponsePromiseRepository, StageEventRepository } from '../report-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation of the stage history. Every statement filters by `organization_id`. */
export function createDrizzleStageEvents(db: DbExecutor): StageEventRepository {
  const { applicationStageEvent: event } = schema;
  return {
    async record(input) {
      await db.insert(event).values(input);
      return input;
    },
    async listByApplication(organizationId, applicationId): Promise<readonly StageEvent[]> {
      return db
        .select()
        .from(event)
        .where(and(eq(event.organizationId, organizationId), eq(event.applicationId, applicationId)))
        .orderBy(asc(event.occurredAt), asc(event.id));
    },
  };
}

export function createDrizzleResponsePromises(db: DbExecutor): ResponsePromiseRepository {
  const { responsePromise: promise } = schema;
  const forApplication = (organizationId: string, applicationId: string) =>
    and(eq(promise.organizationId, organizationId), eq(promise.applicationId, applicationId));
  return {
    async create(input) {
      await db.insert(promise).values(input);
      return input;
    },
    async save(input) {
      const { id, organizationId, ...values } = input;
      const rows = await db
        .update(promise)
        .set(values)
        .where(and(eq(promise.organizationId, organizationId), eq(promise.id, id)))
        .returning({ id: promise.id });
      if (rows.length === 0) throw new Error('response promise not found for save');
      return input;
    },
    async findUnanswered(organizationId, applicationId): Promise<ResponsePromise | null> {
      const [row] = await db
        .select()
        .from(promise)
        .where(and(forApplication(organizationId, applicationId), isNull(promise.respondedAt)))
        .orderBy(asc(promise.startedAt))
        .limit(1);
      return row ?? null;
    },
    listByApplication: (organizationId, applicationId) =>
      db.select().from(promise).where(forApplication(organizationId, applicationId)).orderBy(asc(promise.startedAt), asc(promise.id)),
    async markOverdueMissedAcrossOrganizations(now) {
      const rows = await db
        .update(promise)
        .set({ status: 'missed' })
        .where(and(eq(promise.status, 'open'), lt(promise.dueAt, now)))
        .returning({ id: promise.id });
      return rows.length;
    },
  };
}
