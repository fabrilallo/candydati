import { and, asc, eq, gt, isNull, schema } from '@tt/db';
import type { FeedbackRequest, InterviewFeedback, StageInterviewer } from '@tt/domain';
import { ConflictError } from '../errors.js';
import type { FeedbackRequestRepository, InterviewFeedbackRepository, StageInterviewerRepository } from '../feedback-ports.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

const toInterviewer = (row: typeof schema.jobStageInterviewer.$inferSelect): StageInterviewer => ({ ...row });
const toRequest = (row: typeof schema.feedbackRequest.$inferSelect): FeedbackRequest => ({ ...row });
const toFeedback = (row: typeof schema.interviewFeedback.$inferSelect): InterviewFeedback => ({ ...row });

/** Postgres implementation. Every statement filters by `organization_id`, except the lookup by the hash of a secret. */
export function createDrizzleStageInterviewers(db: DbExecutor): StageInterviewerRepository {
  const { jobStageInterviewer: table } = schema;
  const ofJob = (organizationId: string, jobId: string) => [eq(table.organizationId, organizationId), eq(table.jobId, jobId)];
  return {
    async listByJob(organizationId, jobId) {
      const rows = await db.select().from(table).where(and(...ofJob(organizationId, jobId))).orderBy(asc(table.createdAt), asc(table.id));
      return rows.map(toInterviewer);
    },
    async listByStage(organizationId, jobId, stageId) {
      const rows = await db.select().from(table).where(and(...ofJob(organizationId, jobId), eq(table.stageId, stageId))).orderBy(asc(table.createdAt), asc(table.id));
      return rows.map(toInterviewer);
    },
    async replaceForJob(organizationId, jobId, interviewers) {
      await db.transaction(async (tx) => {
        await tx.delete(table).where(and(...ofJob(organizationId, jobId)));
        if (interviewers.length > 0) await tx.insert(table).values(interviewers.map((i) => ({ ...i })));
      });
    },
  };
}

export function createDrizzleFeedbackRequests(db: DbExecutor): FeedbackRequestRepository {
  const { feedbackRequest: table } = schema;
  return {
    async create(request) {
      try {
        const [row] = await db.insert(table).values(request).returning();
        if (!row) throw new Error('feedback_request insert returned no row');
        return toRequest(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('Token already used.');
        throw error;
      }
    },
    async markSubmitted(organizationId, id, submittedAt) {
      const rows = await db
        .update(table)
        .set({ submittedAt })
        .where(and(eq(table.organizationId, organizationId), eq(table.id, id), isNull(table.submittedAt)))
        .returning({ id: table.id });
      return rows.length > 0;
    },
    async rotateToken(organizationId, id, expectedTokenHash, patch) {
      const [row] = await db
        .update(table)
        .set(patch)
        .where(and(eq(table.organizationId, organizationId), eq(table.id, id), isNull(table.submittedAt), eq(table.tokenHash, expectedTokenHash)))
        .returning();
      return row ? toRequest(row) : null;
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.id, id))).limit(1);
      return row ? toRequest(row) : null;
    },
    async findByTokenHash(tokenHash) {
      const [row] = await db.select().from(table).where(eq(table.tokenHash, tokenHash)).limit(1);
      return row ? toRequest(row) : null;
    },
    async listByApplication(organizationId, applicationId) {
      const rows = await db.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.applicationId, applicationId))).orderBy(asc(table.createdAt), asc(table.id));
      return rows.map(toRequest);
    },
    async listOpenAcrossOrganizations(now) {
      const rows = await db.select().from(table).where(and(isNull(table.submittedAt), gt(table.expiresAt, now))).orderBy(asc(table.createdAt));
      return rows.map(toRequest);
    },
  };
}

export function createDrizzleInterviewFeedback(db: DbExecutor): InterviewFeedbackRepository {
  const { interviewFeedback: table } = schema;
  return {
    async create(feedback) {
      try {
        const [row] = await db.insert(table).values(feedback).returning();
        if (!row) throw new Error('interview_feedback insert returned no row');
        return toFeedback(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('Feedback already submitted.');
        throw error;
      }
    },
    async findByRequest(organizationId, requestId) {
      const [row] = await db.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.requestId, requestId))).limit(1);
      return row ? toFeedback(row) : null;
    },
    async listByApplication(organizationId, applicationId) {
      const rows = await db.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.applicationId, applicationId))).orderBy(asc(table.submittedAt), asc(table.id));
      return rows.map(toFeedback);
    },
  };
}
