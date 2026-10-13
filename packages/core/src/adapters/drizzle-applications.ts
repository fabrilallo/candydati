import { and, asc, desc, eq, isNotNull, isNull, lte, schema } from '@tt/db';
import { CV_MEDIA_TYPES, type Application, type CvMediaType } from '@tt/domain';
import type { ApplicationRepository } from '../candidate-ports.js';
import { ConflictError } from '../errors.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

type Row = typeof schema.application.$inferSelect;

/** The media type column is free text: it is checked on read, so a corrupted row fails loudly. */
const toMediaType = (value: string): CvMediaType => {
  const found = CV_MEDIA_TYPES.find((type) => type === value);
  if (!found) throw new Error(`Unexpected CV media type in database: ${value}`);
  return found;
};

export const toApplication = (row: Row): Application => ({
  id: row.id,
  organizationId: row.organizationId,
  jobId: row.jobId,
  candidateId: row.candidateId,
  stageId: row.stageId,
  outcome: row.outcome,
  message: row.message,
  cv: { key: row.cvKey, fileName: row.cvFileName, mediaType: toMediaType(row.cvMediaType), sizeBytes: row.cvSizeBytes },
  consent: { ...row.consent, givenAt: new Date(row.consent.givenAt) },
  retentionExpiresAt: row.retentionExpiresAt,
  source: row.source,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  stageChangedAt: row.stageChangedAt,
  closedAt: row.closedAt,
  responseDueAt: row.responseDueAt,
  respondedAt: row.respondedAt,
});

const toValues = (a: Application) => ({
  id: a.id,
  organizationId: a.organizationId,
  jobId: a.jobId,
  candidateId: a.candidateId,
  stageId: a.stageId,
  outcome: a.outcome,
  message: a.message,
  cvKey: a.cv.key,
  cvFileName: a.cv.fileName,
  cvMediaType: a.cv.mediaType,
  cvSizeBytes: a.cv.sizeBytes,
  consent: a.consent,
  retentionExpiresAt: a.retentionExpiresAt,
  source: a.source,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  stageChangedAt: a.stageChangedAt,
  closedAt: a.closedAt,
  responseDueAt: a.responseDueAt,
  respondedAt: a.respondedAt,
});

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleApplications(db: DbExecutor): ApplicationRepository {
  const { application } = schema;
  const list = async (where: ReturnType<typeof and>) =>
    (await db.select().from(application).where(where).orderBy(desc(application.createdAt), desc(application.id))).map(toApplication);
  const one = async (where: ReturnType<typeof and>): Promise<Application | null> => {
    const [row] = await db.select().from(application).where(where).limit(1);
    return row ? toApplication(row) : null;
  };
  const awaitingFilter = (dueBefore: Date) => [isNull(application.outcome), isNull(application.respondedAt), isNotNull(application.responseDueAt), lte(application.responseDueAt, dueBefore)];
  const awaiting = async (where: ReturnType<typeof and>) =>
    (await db.select().from(application).where(where).orderBy(asc(application.responseDueAt), asc(application.id))).map(toApplication);
  return {
    async create(input) {
      try {
        const [row] = await db.insert(application).values(toValues(input)).returning();
        if (!row) throw new Error('application insert returned no row');
        return toApplication(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('An open application for this job already exists.');
        throw error;
      }
    },
    async save(input) {
      const { id, organizationId, ...values } = toValues(input);
      const [row] = await db
        .update(application)
        .set(values)
        .where(and(eq(application.organizationId, organizationId), eq(application.id, id)))
        .returning();
      if (!row) throw new Error('application not found for save');
      return toApplication(row);
    },
    findById: (organizationId, id) => one(and(eq(application.organizationId, organizationId), eq(application.id, id))),
    findOpen: (organizationId, jobId, candidateId) =>
      one(
        and(
          eq(application.organizationId, organizationId),
          eq(application.jobId, jobId),
          eq(application.candidateId, candidateId),
          isNull(application.outcome),
        ),
      ),
    listByJob: (organizationId, jobId) => list(and(eq(application.organizationId, organizationId), eq(application.jobId, jobId))),
    listByCandidate: (organizationId, candidateId) =>
      list(and(eq(application.organizationId, organizationId), eq(application.candidateId, candidateId))),
    listAwaitingResponse: (organizationId, dueBefore) => awaiting(and(eq(application.organizationId, organizationId), ...awaitingFilter(dueBefore))),
    listAwaitingResponseAcrossOrganizations: (dueBefore) => awaiting(and(...awaitingFilter(dueBefore))),
  };
}
