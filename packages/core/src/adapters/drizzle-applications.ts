import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, schema, sql } from '@candydati/db';
import { CV_MEDIA_TYPES, isAttachmentMediaType, type Application, type ApplicationAttachment, type AttachmentMediaType, type CvMediaType, type StoredFile } from '@candydati/domain';
import type { ApplicationRepository, RetentionPage } from '../candidate-ports.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

type Row = typeof schema.application.$inferSelect;

/** The media type column is free text: it is checked on read, so a corrupted row fails loudly. */
const toMediaType = (value: string): CvMediaType => {
  const found = CV_MEDIA_TYPES.find((type) => type === value);
  if (!found) throw new Error(`Unexpected CV media type in database: ${value}`);
  return found;
};

/** The four CV columns are all set or, on a migrated application, all null (`application_cv_check`). */
const toStoredFile = (row: Row): StoredFile | null =>
  row.cvKey !== null && row.cvFileName !== null && row.cvMediaType !== null && row.cvSizeBytes !== null
    ? { key: row.cvKey, fileName: row.cvFileName, mediaType: toMediaType(row.cvMediaType), sizeBytes: row.cvSizeBytes }
    : null;

const toApplication = (row: Row): Application => ({
  id: row.id,
  organizationId: row.organizationId,
  jobId: row.jobId,
  candidateId: row.candidateId,
  stageId: row.stageId,
  outcome: row.outcome,
  message: row.message,
  cv: toStoredFile(row),
  ...(row.submittedContact ? { submittedContact: row.submittedContact } : {}),
  ...(row.answers ? { answers: row.answers } : {}),
  consent: { ...row.consent, givenAt: new Date(row.consent.givenAt) },
  consentStatus: row.consentStatus,
  importBatchId: row.importBatchId,
  ...(row.migrationBatchId ? { migrationBatchId: row.migrationBatchId } : {}),
  retentionExpiresAt: row.retentionExpiresAt,
  source: row.source,
  origin: row.origin,
  ...(row.originCampaign ? { originCampaign: row.originCampaign } : {}),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  stageChangedAt: row.stageChangedAt,
  closedAt: row.closedAt,
  responseDueAt: row.responseDueAt,
  respondedAt: row.respondedAt,
  ...(row.reconfirmationSentAt ? { reconfirmationSentAt: row.reconfirmationSentAt } : {}),
});

const toValues = (a: Application) => ({
  id: a.id,
  organizationId: a.organizationId,
  jobId: a.jobId,
  candidateId: a.candidateId,
  stageId: a.stageId,
  outcome: a.outcome,
  message: a.message,
  cvKey: a.cv?.key ?? null,
  cvFileName: a.cv?.fileName ?? null,
  cvMediaType: a.cv?.mediaType ?? null,
  cvSizeBytes: a.cv?.sizeBytes ?? null,
  submittedContact: a.submittedContact ?? null,
  answers: a.answers ?? null,
  consent: a.consent,
  consentStatus: a.consentStatus,
  importBatchId: a.importBatchId,
  migrationBatchId: a.migrationBatchId ?? null,
  retentionExpiresAt: a.retentionExpiresAt,
  source: a.source,
  origin: a.origin,
  originCampaign: a.originCampaign ?? null,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  stageChangedAt: a.stageChangedAt,
  closedAt: a.closedAt,
  responseDueAt: a.responseDueAt,
  respondedAt: a.respondedAt,
  reconfirmationSentAt: a.reconfirmationSentAt ?? null,
});

type AttachmentRow = typeof schema.applicationAttachment.$inferSelect;

const toAttachmentMediaType = (value: string): AttachmentMediaType => {
  if (!isAttachmentMediaType(value)) throw new Error(`Unexpected attachment media type in database: ${value}`);
  return value;
};

export const toAttachment = (row: AttachmentRow): ApplicationAttachment => ({
  id: row.id,
  organizationId: row.organizationId,
  applicationId: row.applicationId,
  migrationBatchId: row.migrationBatchId,
  kind: row.kind,
  fileName: row.fileName,
  mediaType: toAttachmentMediaType(row.mediaType),
  sizeBytes: row.sizeBytes,
  key: row.storageKey,
  createdAt: row.createdAt,
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
  const expiring = async (where: ReturnType<typeof and>, page?: RetentionPage) => {
    const cursor = page?.after;
    const after = cursor
      ? sql`(${application.retentionExpiresAt}, ${application.id}) > (${cursor.retentionExpiresAt.toISOString()}::timestamptz, ${cursor.id})`
      : undefined;
    const query = db.select().from(application).where(and(where, after)).orderBy(asc(application.retentionExpiresAt), asc(application.id));
    return (await (page ? query.limit(page.limit) : query)).map(toApplication);
  };
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
    async transition(organizationId, id, expected, patch) {
      const [row] = await db
        .update(application)
        .set(patch)
        .where(
          and(
            eq(application.organizationId, organizationId),
            eq(application.id, id),
            isNull(application.outcome),
            ...(expected.stageId === undefined ? [] : [eq(application.stageId, expected.stageId)]),
          ),
        )
        .returning();
      if (!row) throw new ConflictError('The application changed meanwhile.');
      return toApplication(row);
    },
    async update(organizationId, id, patch) {
      const [row] = await db
        .update(application)
        .set(patch)
        .where(and(eq(application.organizationId, organizationId), eq(application.id, id)))
        .returning();
      if (!row) throw new NotFoundError('Application not found.');
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
    listRetentionExpiringBefore: (organizationId, before, page) => expiring(and(eq(application.organizationId, organizationId), lte(application.retentionExpiresAt, before)), page),
    listRetentionExpiringAcrossOrganizations: (before, page) => expiring(lte(application.retentionExpiresAt, before), page),
    listByImportBatch: (organizationId, batchId) => list(and(eq(application.organizationId, organizationId), eq(application.importBatchId, batchId))),
    async countCreatedSince(organizationId, since, jobId) {
      const [row] = await db
        .select({ total: count() })
        .from(application)
        .where(
          and(
            eq(application.organizationId, organizationId),
            eq(application.source, 'careers_page'),
            gte(application.createdAt, since),
            ...(jobId === undefined ? [] : [eq(application.jobId, jobId)]),
          ),
        );
      return row?.total ?? 0;
    },
    async listAttachments(organizationId, applicationIds) {
      if (applicationIds.length === 0) return [];
      const { applicationAttachment: attachment } = schema;
      const rows = await db
        .select()
        .from(attachment)
        .where(and(eq(attachment.organizationId, organizationId), inArray(attachment.applicationId, [...applicationIds])))
        .orderBy(asc(attachment.createdAt), asc(attachment.id));
      return rows.map(toAttachment);
    },
    async findAttachment(organizationId, applicationId, attachmentId) {
      const { applicationAttachment: attachment } = schema;
      const [row] = await db
        .select()
        .from(attachment)
        .where(and(eq(attachment.organizationId, organizationId), eq(attachment.applicationId, applicationId), eq(attachment.id, attachmentId)))
        .limit(1);
      return row ? toAttachment(row) : null;
    },
  };
}
