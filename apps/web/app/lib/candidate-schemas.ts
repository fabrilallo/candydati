import { CONSENT_SCOPES, cvExtractionSchema, EXTRACTION_STATUSES, JOB_STATUSES, OUTCOMES, selectionStageSchema, SUPPORTED_LOCALES } from '@tt/domain'
import { z } from 'zod'

/**
 * Zod mirrors of the Phase 2 DTOs (docs: phase 2 contract). Every response of the candidate, pipeline and privacy
 * endpoints is validated against these before a screen sees it. Dates stay ISO strings.
 */
const isoDate = z.iso.datetime({ offset: true })

const retentionDaysSchema = z.object({ selection: z.number().int().positive(), talent_pool: z.number().int().positive() })

export const privacyNoticeSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  language: z.enum(SUPPORTED_LOCALES),
  text: z.string(),
  contactEmail: z.string(),
  retentionDays: retentionDaysSchema,
  createdAt: isoDate,
})
export type PrivacyNoticeDto = z.infer<typeof privacyNoticeSchema>

/** What a candidate reads on the public page before applying. */
export const publicPrivacyNoticeSchema = privacyNoticeSchema.pick({ version: true, language: true, text: true, contactEmail: true, retentionDays: true })
export type PublicPrivacyNoticeDto = z.infer<typeof publicPrivacyNoticeSchema>

export const privacyTemplateSchema = z.object({ text: z.string() })

/** A pipeline stage: `received` (declared null) or one declared stage of the ad. */
export const stageRefSchema = z.object({ id: z.string(), declared: selectionStageSchema.nullable() })
export type StageRef = z.infer<typeof stageRefSchema>

export const applicationCardSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  outcome: z.enum(OUTCOMES).nullable(),
  createdAt: isoDate,
  stageChangedAt: isoDate,
  closedAt: isoDate.nullable(),
  noteCount: z.number().int().nonnegative(),
  candidate: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    tags: z.array(z.string()),
    headline: z.string().nullable(),
    location: z.string().nullable(),
    yearsOfExperience: z.number().int().nonnegative().nullable(),
  }),
})
export type ApplicationCardDto = z.infer<typeof applicationCardSchema>

export const pipelineSchema = z.object({
  job: z.object({ id: z.string(), title: z.string(), status: z.enum(JOB_STATUSES) }),
  stages: z.array(stageRefSchema.extend({ count: z.number().int().nonnegative() })),
  applications: z.array(applicationCardSchema),
})
export type PipelineDto = z.infer<typeof pipelineSchema>
export type PipelineStageDto = PipelineDto['stages'][number]

export const candidateSummarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  tags: z.array(z.string()),
  talentPool: z.boolean(),
  applicationCount: z.number().int().nonnegative(),
  lastAppliedAt: isoDate.nullable(),
  retentionExpiresAt: isoDate,
})
export type CandidateSummaryDto = z.infer<typeof candidateSummarySchema>

export const noteSchema = z.object({
  id: z.string(),
  applicationId: z.string().nullable(),
  author: z.object({ id: z.string(), name: z.string() }),
  body: z.string(),
  createdAt: isoDate,
})
export type NoteDto = z.infer<typeof noteSchema>

const extractionSchema = z.object({
  status: z.enum(EXTRACTION_STATUSES),
  data: cvExtractionSchema.nullable(),
  source: z.enum(['model', 'text']).nullable(),
})
export type ExtractionDto = z.infer<typeof extractionSchema>

export const candidateApplicationSchema = z.object({
  id: z.string(),
  job: z.object({ id: z.string(), title: z.string(), slug: z.string() }),
  stageId: z.string(),
  stages: z.array(stageRefSchema),
  outcome: z.enum(OUTCOMES).nullable(),
  message: z.string(),
  createdAt: isoDate,
  stageChangedAt: isoDate,
  closedAt: isoDate.nullable(),
  consent: z.object({ privacyNoticeVersion: z.number().int().positive(), scopes: z.array(z.enum(CONSENT_SCOPES)), givenAt: isoDate }),
  retentionExpiresAt: isoDate,
  cv: z.object({ fileName: z.string(), mediaType: z.string(), sizeBytes: z.number().int().nonnegative() }),
  /** Absent while the extraction job has not written its record yet. */
  extraction: extractionSchema.nullable().default(null),
})
export type CandidateApplicationDto = z.infer<typeof candidateApplicationSchema>

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
  }),
  applications: z.array(candidateApplicationSchema),
  notes: z.array(noteSchema),
})
export type CandidateDetailDto = z.infer<typeof candidateDetailSchema>

export const receivedSchema = z.object({ received: z.literal(true) })
