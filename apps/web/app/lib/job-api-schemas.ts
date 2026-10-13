import {
  adQualityReportSchema,
  CONTRACT_TYPES,
  isPublishedContent,
  JOB_ROLES,
  JOB_STATUSES,
  jobContentSchema,
  jobDtoSchema,
  SENIORITY_LEVELS,
  WORK_MODES,
  type PublicCareersDto,
  type PublicJobPageDto,
  type PublishedJobContent,
} from '@tt/domain'
import { z } from 'zod'
import { publicPrivacyNoticeSchema, type PublicPrivacyNoticeDto } from './candidate-schemas'

const isoDate = z.iso.datetime()

export const jobSchema = jobDtoSchema
export const jobSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(JOB_STATUSES),
  title: z.string(),
  role: z.enum(JOB_ROLES).nullable(),
  publishable: z.boolean(),
  publishIssueCount: z.number().int().min(0),
  salary: jobContentSchema.shape.salary,
  workMode: z.enum(WORK_MODES).nullable(),
  qualityTotal: z.number().nullable(),
  belowThreshold: z.boolean(),
  updatedAt: isoDate,
  publishedAt: isoDate.nullable(),
})
export const templateSchema = z.object({ id: z.string(), name: z.string(), content: jobContentSchema, updatedAt: isoDate })
export const assessmentSchema = z.object({ report: adQualityReportSchema, threshold: z.number(), belowThreshold: z.boolean() })
export const publishIssueSchema = z.object({ path: z.string(), rule: z.string() })
export const publishResultSchema = z.object({ job: jobSchema, quality: assessmentSchema.nullable() })
export const qualityResultSchema = z.object({ assessment: assessmentSchema, publishIssues: z.array(publishIssueSchema) })
export const deletedSchema = z.object({ id: z.string() })

const publishedContentSchema = z
  .custom<PublishedJobContent>((value) => jobContentSchema.safeParse(value).success && isPublishedContent(jobContentSchema.parse(value)))
  .transform((value) => jobContentSchema.parse(value) as PublishedJobContent)
const organizationSchema = z.object({ name: z.string(), slug: z.string(), logo: z.string().nullable() })

const publicSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  role: z.enum(JOB_ROLES),
  seniority: z.enum(SENIORITY_LEVELS),
  contractType: z.enum(CONTRACT_TYPES),
  workMode: z.enum(WORK_MODES),
  location: jobContentSchema.shape.location,
  salary: jobContentSchema.shape.salary,
  stageCount: z.number().int().min(0),
  responseDays: z.number().int().min(1),
  publishedAt: isoDate,
  updatedAt: isoDate,
})

export const publicCareersSchema = z.object({ organization: organizationSchema, jobs: z.array(publicSummarySchema) }) as unknown as z.ZodType<PublicCareersDto>
/** The public ad page plus the notice a candidate reads before applying (Phase 2); `null` while there is none. */
export type PublicJobPage = PublicJobPageDto & { readonly privacyNotice: PublicPrivacyNoticeDto | null }
export const publicJobPageSchema = z.object({
  organization: organizationSchema,
  job: z.object({ slug: z.string(), content: publishedContentSchema, publishedAt: isoDate, updatedAt: isoDate }),
  // Tolerant while the api rolls out: a page without the field reads as "applications not open yet".
  privacyNotice: publicPrivacyNoticeSchema.nullable().default(null),
}) as unknown as z.ZodType<PublicJobPage>
