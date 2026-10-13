import { and, eq, inArray, schema, sql } from '@tt/db';
import type { ErasureStore, ErasureTransaction } from '../privacy-ports.js';
import type { DbExecutor } from './db-executor.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleOutbox } from './drizzle-outbox.js';

/**
 * Postgres implementation of the erasure. Child rows go first (foreign keys are RESTRICT on purpose: a forgotten table
 * fails loudly instead of leaving data behind), every statement filters by `organization_id`.
 */
export function createDrizzleErasureStore(db: DbExecutor): ErasureStore {
  const { application, applicationStageEvent, candidate, candidateNote, consentToken, conversation, cvExtraction, feedbackRequest, interviewFeedback, message, notification, outboxEvent, responsePromise, task, webhookDelivery } = schema;

  /** Outbox events (and their deliveries) whose data mentions one of these ids under `key`. */
  const deleteEvents = async (organizationId: string, key: 'applicationId' | 'candidateId', ids: readonly string[]): Promise<void> => {
    const events = await db
      .select({ id: outboxEvent.id })
      .from(outboxEvent)
      .where(and(eq(outboxEvent.organizationId, organizationId), inArray(sql`${outboxEvent.data} ->> ${key}`, [...ids])));
    if (events.length === 0) return;
    const eventIds = events.map((event) => event.id);
    await db.delete(webhookDelivery).where(and(eq(webhookDelivery.organizationId, organizationId), inArray(webhookDelivery.eventId, eventIds)));
    await db.delete(outboxEvent).where(and(eq(outboxEvent.organizationId, organizationId), inArray(outboxEvent.id, eventIds)));
  };

  return {
    async deleteApplications(organizationId, applicationIds) {
      if (applicationIds.length === 0) return [];
      const ids = [...applicationIds];
      const rows = await db
        .select({ cvKey: application.cvKey })
        .from(application)
        .where(and(eq(application.organizationId, organizationId), inArray(application.id, ids)));
      const tasks = await db
        .select({ id: task.id })
        .from(task)
        .where(and(eq(task.organizationId, organizationId), inArray(task.applicationId, ids)));
      const taskIds = tasks.map((t) => t.id);
      const ownNotifications = [inArray(notification.applicationId, ids), ...(taskIds.length > 0 ? [inArray(notification.taskId, taskIds)] : [])];
      await db.delete(notification).where(and(eq(notification.organizationId, organizationId), sql`(${sql.join(ownNotifications, sql` or `)})`));
      await db.delete(task).where(and(eq(task.organizationId, organizationId), inArray(task.applicationId, ids)));
      await deleteEvents(organizationId, 'applicationId', ids);
      await db.delete(message).where(and(eq(message.organizationId, organizationId), inArray(message.applicationId, ids)));
      await db.delete(conversation).where(and(eq(conversation.organizationId, organizationId), inArray(conversation.applicationId, ids)));
      await db.delete(cvExtraction).where(and(eq(cvExtraction.organizationId, organizationId), inArray(cvExtraction.applicationId, ids)));
      await db.delete(candidateNote).where(and(eq(candidateNote.organizationId, organizationId), inArray(candidateNote.applicationId, ids)));
      await db.delete(consentToken).where(and(eq(consentToken.organizationId, organizationId), inArray(consentToken.applicationId, ids)));
      await db.delete(interviewFeedback).where(and(eq(interviewFeedback.organizationId, organizationId), inArray(interviewFeedback.applicationId, ids)));
      await db.delete(feedbackRequest).where(and(eq(feedbackRequest.organizationId, organizationId), inArray(feedbackRequest.applicationId, ids)));
      await db.delete(responsePromise).where(and(eq(responsePromise.organizationId, organizationId), inArray(responsePromise.applicationId, ids)));
      await db.delete(applicationStageEvent).where(and(eq(applicationStageEvent.organizationId, organizationId), inArray(applicationStageEvent.applicationId, ids)));
      await db.delete(application).where(and(eq(application.organizationId, organizationId), inArray(application.id, ids)));
      return rows.map((row) => row.cvKey);
    },
    async deleteCandidate(organizationId, candidateId) {
      await db.delete(candidateNote).where(and(eq(candidateNote.organizationId, organizationId), eq(candidateNote.candidateId, candidateId)));
      await deleteEvents(organizationId, 'candidateId', [candidateId]);
      await db.delete(candidate).where(and(eq(candidate.organizationId, organizationId), eq(candidate.id, candidateId)));
    },
  };
}

/** One Postgres transaction for the deletions, the audit event and the outbox event: all of it or none of it. */
export function createDrizzleErasure(db: DbExecutor): ErasureTransaction {
  return {
    run: (work) =>
      db.transaction((tx) => work({ store: createDrizzleErasureStore(tx), auditLog: createDrizzleAuditLog(tx), outbox: createDrizzleOutbox(tx) })),
  };
}
