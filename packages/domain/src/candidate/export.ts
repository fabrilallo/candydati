import { z } from 'zod';
import { CONSENT_SCOPES, CONSENT_STATUSES } from './privacy.js';
import { EXTRACTION_STATUSES, OUTCOMES, cvExtractionSchema } from './application.js';
import { FEEDBACK_RECOMMENDATIONS } from '../feedback/feedback.js';
import { MESSAGE_DIRECTIONS, MESSAGE_STATUSES } from '../messaging/message.js';
import { ATTACHMENT_KINDS } from './attachment.js';

/** Identifier of the public, versioned schema of the candidate export (PRODUCT.md §6). Bump the version on breaking changes. */
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

/** A file of the application other than its CV (only migrations bring them today), stored in the ZIP like the CV. */
const exportedAttachmentSchema = exportedFileSchema.extend({
  id: z.string(),
  kind: z.enum(ATTACHMENT_KINDS),
  createdAt: date,
});

const exportedAnswerSchema = z.object({ question: z.string(), answer: z.string() });

const exportedMessageSchema = z.object({
  id: z.string(),
  direction: z.enum(MESSAGE_DIRECTIONS),
  status: z.enum(MESSAGE_STATUSES),
  subject: z.string(),
  body: z.string(),
  createdAt: date,
  sentAt: nullableDate,
});

const exportedFeedbackSchema = z.object({
  id: z.string(),
  stageId: z.string(),
  interviewerName: z.string(),
  answers: z.record(z.string(), z.string()),
  recommendation: z.enum(FEEDBACK_RECOMMENDATIONS),
  submittedAt: date,
});

/** A request for feedback sent to an interviewer: the interviewer's address is the interviewer's own data, not the candidate's. */
const exportedFeedbackRequestSchema = z.object({
  id: z.string(),
  stageId: z.string(),
  interviewerName: z.string(),
  createdAt: date,
  expiresAt: date,
  submittedAt: nullableDate,
});

const exportedApplicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  source: z.enum(['careers_page', 'manual', 'import']),
  /** Current stage and when the application entered it. */
  stageId: z.string(),
  stageChangedAt: date,
  outcome: z.enum(OUTCOMES).nullable(),
  message: z.string(),
  createdAt: date,
  closedAt: nullableDate,
  retentionExpiresAt: date,
  consent: z.object({
    /** `to_renew`: imported data, nothing consented yet (version 0, no scopes). */
    status: z.enum(CONSENT_STATUSES).default('given'),
    privacyNoticeVersion: z.number().int().min(0),
    scopes: z.array(z.enum(CONSENT_SCOPES)),
    givenAt: date,
  }),
  /** null for an application brought by a migration from another ATS without a CV. */
  cv: exportedFileSchema.nullable(),
  extraction: z
    .object({
      status: z.enum(EXTRACTION_STATUSES),
      source: z.enum(['model', 'text']).nullable(),
      text: z.string().nullable(),
      data: cvExtractionSchema.nullable(),
    })
    .nullable(),
  messages: z.array(exportedMessageSchema),
  feedback: z.array(exportedFeedbackSchema).default([]),
  feedbackRequests: z.array(exportedFeedbackRequestSchema).default([]),
  /**
   * Added within v1 (optional, so files produced before stay valid): the attachments, each with its `path` in the ZIP,
   * and the form answers kept from another ATS. The product always writes both, empty when there is nothing.
   */
  attachments: z.array(exportedAttachmentSchema).optional(),
  answers: z.array(exportedAnswerSchema).optional(),
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
      /** null for a note brought by a migration whose author is not a member of the organization. */
      authorId: z.string().nullable(),
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
