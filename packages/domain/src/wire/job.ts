import { z } from 'zod';
import { adQualityReportSchema } from '../job/quality.js';
import { isPublishedContent, jobContentSchema, type PublishedJobContent } from '../job/content.js';
import { jobDtoSchema, JOB_STATUSES, type PublicCareersDto, type PublicJobPageDto } from '../job/job.js';
import { CONTRACT_TYPES, CUSTOM_ROLE_MAX, JOB_ROLE_CHOICES, SENIORITY_LEVELS, WORK_MODES } from '../job/taxonomy.js';
import { publicPrivacyNoticeSchema, type PublicPrivacyNoticeDto } from './privacy.js';
import { isoDate } from './common.js';

/** The job as the api sends it: compliance warnings and publish issues included, no approval (read from its own route). */
export const jobSchema = jobDtoSchema;

export const jobSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(JOB_STATUSES),
  title: z.string(),
  role: z.enum(JOB_ROLE_CHOICES).nullable(),
  customRole: z.string().max(CUSTOM_ROLE_MAX).nullable(),
  publishable: z.boolean(),
  publishIssueCount: z.number().int().min(0),
  salary: jobContentSchema.shape.salary,
  workMode: z.enum(WORK_MODES).nullable(),
  qualityTotal: z.number().nullable(),
  belowThreshold: z.boolean(),
  updatedAt: isoDate,
  publishedAt: isoDate.nullable(),
});

export const templateSchema = z.object({ id: z.string(), name: z.string(), content: jobContentSchema, updatedAt: isoDate });
export const assessmentSchema = z.object({ report: adQualityReportSchema, threshold: z.number(), belowThreshold: z.boolean() });
export const publishIssueSchema = z.object({ path: z.string(), rule: z.string() });
export const publishResultSchema = z.object({ job: jobSchema, quality: assessmentSchema.nullable() });
/** `POST /jobs/quality`: the analysis of unsaved content and what still blocks publication. */
export const qualityResultSchema = z.object({ assessment: assessmentSchema, publishIssues: z.array(publishIssueSchema) });
/** What a person gets back to accept line by line; never saved by the server. */
export const SUGGESTED_RESPONSIBILITIES_MAX = 6;
export const SUGGESTED_RESPONSIBILITY_MAX = 160;
/** The model's answer (3 to 6 short lines) and the shape of `POST /jobs/responsibilities/suggest`. */
export const responsibilitySuggestionsSchema = z.object({
  responsibilities: z.array(z.string().trim().min(1).max(SUGGESTED_RESPONSIBILITY_MAX)).min(3).max(SUGGESTED_RESPONSIBILITIES_MAX),
});
export type SuggestResponsibilitiesResult =
  | { readonly status: 'proposed'; readonly responsibilities: readonly string[] }
  | { readonly status: 'unavailable' }
  | { readonly status: 'failed' };
/** A plain object on the wire (the OpenAPI document needs one); `responsibilities` is present when `status` is `proposed`. */
export const suggestResponsibilitiesResultSchema = z.object({
  status: z.enum(['proposed', 'unavailable', 'failed']),
  responsibilities: z.array(z.string()).optional(),
});
export const deletedSchema = z.object({ id: z.string() });

const publishedContentSchema = z
  .custom<PublishedJobContent>((value) => jobContentSchema.safeParse(value).success && isPublishedContent(jobContentSchema.parse(value)))
  .transform((value) => jobContentSchema.parse(value) as PublishedJobContent);
const organizationSchema = z.object({ name: z.string(), slug: z.string(), logo: z.string().nullable() });

const publicSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  role: z.enum(JOB_ROLE_CHOICES),
  customRole: z.string().max(CUSTOM_ROLE_MAX).optional(),
  seniority: z.enum(SENIORITY_LEVELS),
  contractType: z.enum(CONTRACT_TYPES),
  workMode: z.enum(WORK_MODES),
  location: jobContentSchema.shape.location,
  salary: jobContentSchema.shape.salary,
  stageCount: z.number().int().min(0),
  responseDays: z.number().int().min(1),
  publishedAt: isoDate,
  updatedAt: isoDate,
});

export const publicCareersSchema = z.object({ organization: organizationSchema, jobs: z.array(publicSummarySchema) }) as unknown as z.ZodType<PublicCareersDto>;

/** The public ad page plus the notice a candidate reads before applying; `null` while the organization has none. */
export type PublicJobPage = PublicJobPageDto & { readonly privacyNotice: PublicPrivacyNoticeDto | null };
export const publicJobPageSchema = z.object({
  organization: organizationSchema,
  job: z.object({ slug: z.string(), content: publishedContentSchema, publishedAt: isoDate, updatedAt: isoDate }),
  privacyNotice: publicPrivacyNoticeSchema.nullable(),
}) as unknown as z.ZodType<PublicJobPage>;
