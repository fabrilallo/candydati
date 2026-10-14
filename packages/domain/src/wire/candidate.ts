import { z } from 'zod';
import { cvExtractionSchema, EXTRACTION_STATUSES, OUTCOMES } from '../candidate/application.js';
import { selectionStageSchema } from '../job/content.js';
import { JOB_STATUSES } from '../job/job.js';
import { RESPONSE_STATES } from '../response/response-state.js';
import { isoDate } from './common.js';
import { applicationConsentSchema, cardConsentFields, importedFields } from './consent.js';

/**
 * Wire shapes of the candidate and pipeline endpoints: `packages/core/src/mappers/candidate-dto.ts` is the source.
 * Every field is always present; `responseState` is never null (the api computes it for every application).
 */
const count = z.number().int().nonnegative();
const responseFields = { responseDueAt: isoDate.nullable(), respondedAt: isoDate.nullable(), responseState: z.enum(RESPONSE_STATES) };

/** A pipeline stage: `received` (declared null) or one declared stage of the ad. */
export const stageRefSchema = z.object({ id: z.string(), declared: selectionStageSchema.nullable() });
export type StageRef = z.infer<typeof stageRefSchema>;

export const applicationCardSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  outcome: z.enum(OUTCOMES).nullable(),
  createdAt: isoDate,
  stageChangedAt: isoDate,
  closedAt: isoDate.nullable(),
  noteCount: count,
  /** The stage was removed from the job's process: shown as "stage removed". */
  stageRemoved: z.boolean(),
  ...responseFields,
  ...cardConsentFields,
  candidate: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    tags: z.array(z.string()),
    headline: z.string().nullable(),
    location: z.string().nullable(),
    yearsOfExperience: count.nullable(),
  }),
});
export type ApplicationCardDto = z.infer<typeof applicationCardSchema>;

export const pipelineSchema = z.object({
  job: z.object({ id: z.string(), title: z.string(), status: z.enum(JOB_STATUSES) }),
  stages: z.array(stageRefSchema.extend({ count })),
  applications: z.array(applicationCardSchema),
});
export type PipelineDto = z.infer<typeof pipelineSchema>;
export type PipelineStageDto = PipelineDto['stages'][number];

export const candidateSummarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  tags: z.array(z.string()),
  talentPool: z.boolean(),
  applicationCount: count,
  lastAppliedAt: isoDate.nullable(),
  retentionExpiresAt: isoDate,
  ...importedFields,
});
export type CandidateSummaryDto = z.infer<typeof candidateSummarySchema>;

export const noteSchema = z.object({
  id: z.string(),
  applicationId: z.string().nullable(),
  author: z.object({ id: z.string(), name: z.string() }),
  body: z.string(),
  createdAt: isoDate,
});
export type NoteDto = z.infer<typeof noteSchema>;

const extractionSchema = z.object({
  status: z.enum(EXTRACTION_STATUSES),
  data: cvExtractionSchema.nullable(),
  source: z.enum(['model', 'text']).nullable(),
});
export type ExtractionDto = z.infer<typeof extractionSchema>;

export const candidateApplicationSchema = z.object({
  id: z.string(),
  job: z.object({ id: z.string(), title: z.string(), slug: z.string() }),
  stageId: z.string(),
  stageRemoved: z.boolean(),
  stages: z.array(stageRefSchema),
  outcome: z.enum(OUTCOMES).nullable(),
  message: z.string(),
  createdAt: isoDate,
  stageChangedAt: isoDate,
  closedAt: isoDate.nullable(),
  ...responseFields,
  /** Whether consent was given or is still to renew lives in `consent.status`. */
  consent: applicationConsentSchema,
  importBatchId: z.string().nullable(),
  retentionExpiresAt: isoDate,
  cv: z.object({ fileName: z.string(), mediaType: z.string(), sizeBytes: count }),
  /** What the person typed on the public form (never applied to the profile by itself); null for imports and manual entries. */
  submittedContact: z
    .object({ firstName: z.string(), lastName: z.string(), phone: z.string().nullable(), linkedinUrl: z.string().nullable() })
    .nullable()
    .optional(),
  extraction: extractionSchema,
  /** Messages in the conversation of this application (sent, received and failed). */
  messageCount: count,
});
export type CandidateApplicationDto = z.infer<typeof candidateApplicationSchema>;

export const candidateDetailSchema = z.object({
  candidate: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    tags: z.array(z.string()),
    talentPool: z.boolean(),
    retentionExpiresAt: isoDate,
    createdAt: isoDate,
    ...importedFields,
  }),
  applications: z.array(candidateApplicationSchema),
  notes: z.array(noteSchema),
});
export type CandidateDetailDto = z.infer<typeof candidateDetailSchema>;

export const receivedSchema = z.object({ received: z.literal(true) });
