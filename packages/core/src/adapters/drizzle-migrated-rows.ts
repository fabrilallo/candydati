import { and, eq, inArray, ne, not, schema, sql } from '@candydati/db';
import type { MigratedRowsRepository } from '../migration-commit-ports.js';
import { isForeignKeyViolation, type DbExecutor } from './db-executor.js';

const INSERT_CHUNK = 500;

async function insertInChunks<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) await insert(rows.slice(start, start + INSERT_CHUNK));
}

/** Postgres implementation. Every statement filters by `organization_id`; the batch id comes from the call, never from a row. */
export function createDrizzleMigratedRows(db: DbExecutor): MigratedRowsRepository {
  const { job, candidate, application, candidateNote, message, applicationStageEvent } = schema;
  return {
    async insertJob(batchId, value) {
      await db.insert(job).values({ ...value, title: value.content.title, origin: 'migration', migrationBatchId: batchId });
    },
    async insertCandidate(batchId, value) {
      await db.insert(candidate).values({ ...value, tags: [...value.tags], migrationBatchId: batchId });
    },
    async insertStageEvents(batchId, events) {
      await insertInChunks(events, (chunk) => db.insert(applicationStageEvent).values(chunk.map((event) => ({ ...event, migrationBatchId: batchId }))));
    },
    async insertNotes(batchId, notes) {
      await insertInChunks(notes, (chunk) => db.insert(candidateNote).values(chunk.map((note) => ({ ...note, migrationBatchId: batchId }))));
    },
    async insertMessages(batchId, messages) {
      await insertInChunks(messages, (chunk) => db.insert(message).values(chunk.map((value) => ({ ...value, migrationBatchId: batchId }))));
    },
    async candidateIdsOf(organizationId, batchId) {
      const rows = await db.execute<{ id: string }>(sql`
        select ${application.candidateId} as id from ${application} where ${application.organizationId} = ${organizationId} and ${application.migrationBatchId} = ${batchId}
        union select ${candidate.id} from ${candidate} where ${candidate.organizationId} = ${organizationId} and ${candidate.migrationBatchId} = ${batchId}
        union select ${candidateNote.candidateId} from ${candidateNote} where ${candidateNote.organizationId} = ${organizationId} and ${candidateNote.migrationBatchId} = ${batchId}
        union select ${message.candidateId} from ${message} where ${message.organizationId} = ${organizationId} and ${message.migrationBatchId} = ${batchId}
        order by 1`);
      return rows.rows.map((row) => row.id);
    },
    async jobIdsOf(organizationId, batchId) {
      const rows = await db.select({ id: job.id }).from(job).where(and(eq(job.organizationId, organizationId), eq(job.migrationBatchId, batchId))).orderBy(job.id);
      return rows.map((row) => row.id);
    },
    async deleteHistory(organizationId, batchId, keep) {
      const kept = [...keep];
      const notKept = <C extends typeof candidateNote.candidateId | typeof message.candidateId>(column: C) => (kept.length === 0 ? undefined : not(inArray(column, kept)));
      const keptApplications = db.select({ id: application.id }).from(application).where(and(eq(application.organizationId, organizationId), inArray(application.candidateId, kept)));
      const notes = await db
        .delete(candidateNote)
        .where(and(eq(candidateNote.organizationId, organizationId), eq(candidateNote.migrationBatchId, batchId), notKept(candidateNote.candidateId)))
        .returning({ id: candidateNote.id });
      const messages = await db
        .delete(message)
        .where(and(eq(message.organizationId, organizationId), eq(message.migrationBatchId, batchId), notKept(message.candidateId)))
        .returning({ id: message.id });
      const events = await db
        .delete(applicationStageEvent)
        .where(
          and(
            eq(applicationStageEvent.organizationId, organizationId),
            eq(applicationStageEvent.migrationBatchId, batchId),
            kept.length === 0 ? undefined : not(inArray(applicationStageEvent.applicationId, keptApplications)),
          ),
        )
        .returning({ id: applicationStageEvent.id });
      return notes.length + messages.length + events.length;
    },
    async deleteJobIfUnused(organizationId, batchId, jobId) {
      const used = db.select({ id: application.id }).from(application).where(and(eq(application.organizationId, organizationId), eq(application.jobId, jobId)));
      try {
        // A savepoint: a job still referenced elsewhere (an automation, a distribution...) is refused and the caller goes on.
        const deleted = await db.transaction((tx) =>
          tx
            .delete(job)
            .where(and(eq(job.organizationId, organizationId), eq(job.id, jobId), eq(job.migrationBatchId, batchId), ne(job.status, 'published'), sql`not exists (${used})`))
            .returning({ id: job.id }),
        );
        return deleted.length > 0;
      } catch (error) {
        if (isForeignKeyViolation(error)) return false;
        throw error;
      }
    },
  };
}
