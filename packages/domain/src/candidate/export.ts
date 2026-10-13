import { z } from 'zod';
import { CONSENT_SCOPES } from './privacy.js';
import { EXTRACTION_STATUSES, OUTCOMES, cvExtractionSchema } from './application.js';
import { MESSAGE_DIRECTIONS, MESSAGE_STATUSES } from '../messaging/message.js';

/** Identifier of the public, versioned schema of the candidate export (PLAN §7). Bump the version on breaking changes. */
export const CANDIDATE_EXPORT_SCHEMA_ID = 'candidate-export.v1';

const date = z.iso.datetime();
const nullableDate = date.nullable();

const exportedFileSchema = z.object({
  /** Path of the original document inside the ZIP. */
  path: z.string(),
  fileName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

const exportedMessageSchema = z.object({
  id: z.string(),
  direction: z.enum(MESSAGE_DIRECTIONS),
  status: z.enum(MESSAGE_STATUSES),
  subject: z.string(),
  body: z.string(),
  createdAt: date,
  sentAt: nullableDate,
});

const exportedApplicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  source: z.enum(['careers_page', 'manual']),
  /** Current stage and when the application entered it. */
  stageId: z.string(),
  stageChangedAt: date,
  outcome: z.enum(OUTCOMES).nullable(),
  message: z.string(),
  createdAt: date,
  closedAt: nullableDate,
  retentionExpiresAt: date,
  consent: z.object({
    privacyNoticeVersion: z.number().int().positive(),
    scopes: z.array(z.enum(CONSENT_SCOPES)),
    givenAt: date,
  }),
  cv: exportedFileSchema,
  extraction: z
    .object({
      status: z.enum(EXTRACTION_STATUSES),
      source: z.enum(['model', 'text']).nullable(),
      text: z.string().nullable(),
      data: cvExtractionSchema.nullable(),
    })
    .nullable(),
  messages: z.array(exportedMessageSchema),
});

/**
 * Everything the platform stores about one candidate, as published in `docs/schema/candidate-export.v1.json`.
 * Dates are ISO 8601 strings. Notes are included: they are personal data about the candidate too.
 */
export const candidateExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: date,
  candidate: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    tags: z.array(z.string()),
    talentPool: z.boolean(),
    retentionExpiresAt: date,
    createdAt: date,
    updatedAt: date,
  }),
  applications: z.array(exportedApplicationSchema),
  notes: z.array(
    z.object({
      id: z.string(),
      applicationId: z.string().nullable(),
      authorId: z.string(),
      body: z.string(),
      createdAt: date,
    }),
  ),
});
export type CandidateExport = z.infer<typeof candidateExportSchema>;

/** JSON Schema (draft 2020-12) of the candidate export. */
export function candidateExportJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(candidateExportSchema, { io: 'output' }),
    $id: CANDIDATE_EXPORT_SCHEMA_ID,
    title: 'Candidate export (v1)',
  };
}
