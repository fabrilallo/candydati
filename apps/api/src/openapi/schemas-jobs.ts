import {
  CONTRACT_TYPES,
  CUSTOM_ROLE_MAX,
  JOB_ROLE_CHOICES,
  JOB_STATUSES,
  PUBLISH_RULES,
  SENIORITY_LEVELS,
  WORK_MODES,
  adQualityReportSchema,
  jobContentSchema,
  jobDtoSchema,
  locationSchema,
  salarySchema,
  suggestResponsibilitiesResultSchema,
  AD_QUALITY_STATUSES,
  type AdQualityAssessment,
  type JobSummaryDto,
  type JobTemplateDto,
  type PublishJobResultDto,
} from '@candydati/domain';
import { z } from 'zod';

const isoDate = z.iso.datetime();

/** Zod schemas of the job DTOs, which core only declares as TypeScript types. The `satisfies`-style annotations keep them in step. */
export const jobSummarySchema: z.ZodType<JobSummaryDto> = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(JOB_STATUSES),
  title: z.string(),
  role: z.enum(JOB_ROLE_CHOICES).nullable(),
  customRole: z.string().max(CUSTOM_ROLE_MAX).nullable(),
  publishable: z.boolean(),
  publishIssueCount: z.number().int(),
  salary: salarySchema,
  workMode: z.enum(WORK_MODES).nullable(),
  qualityTotal: z.number().nullable(),
  belowThreshold: z.boolean(),
  updatedAt: isoDate,
  publishedAt: isoDate.nullable(),
});

export const jobTemplateSchema: z.ZodType<JobTemplateDto> = z.object({
  id: z.string(),
  name: z.string(),
  content: jobContentSchema,
  updatedAt: isoDate,
});

export const qualityAssessmentSchema: z.ZodType<AdQualityAssessment> = z.object({
  report: adQualityReportSchema,
  threshold: z.number(),
  belowThreshold: z.boolean(),
});

const complianceDetailSchema = z.object({ match: z.string(), suggestion: z.string() }).describe('The offending text and a suggested fix.');

/** `detail` is present on compliance rules (both-sexes title, gender and discriminatory requirements). */
export const publishIssueSchema = z.object({ path: z.string(), rule: z.enum(PUBLISH_RULES), detail: z.exactOptional(complianceDetailSchema) });

/** `jobDtoSchema` with the publish rule ids as an enum. */
export const jobSchema = jobDtoSchema.extend({ publishIssues: z.array(publishIssueSchema) });

/** Without a language model `status` is `unavailable` and `assessment` is null: no score at all, the publication rules still checked. */
export const analyzeResultSchema = z.object({
  status: z.enum(['assessed', 'unavailable']).describe('`unavailable` while the instance has no AI model: there is no score at all.'),
  assessment: qualityAssessmentSchema.nullable(),
  publishIssues: z.array(publishIssueSchema),
  complianceWarnings: jobDtoSchema.shape.complianceWarnings,
});

export const publishResultSchema: z.ZodType<PublishJobResultDto> = z.object({
  job: jobSchema,
  quality: qualityAssessmentSchema.nullable(),
  qualityStatus: z.enum(AD_QUALITY_STATUSES).describe('`assessed` with a score, `unavailable` without an AI model (no score at all), `failed` when the analysis could not run.'),
});

/** The content of a published ad: every §5.1 field present. */
export const publishedContentSchema = jobContentSchema.extend({
  role: z.enum(JOB_ROLE_CHOICES),
  seniority: z.enum(SENIORITY_LEVELS),
  contractType: z.enum(CONTRACT_TYPES),
  workMode: z.enum(WORK_MODES),
  responseDays: z.number().int().min(1),
  salary: salarySchema.extend({ min: z.number().int().positive(), max: z.number().int().positive() }),
  location: locationSchema.extend({ country: z.string().regex(/^[A-Z]{2}$/) }),
});

const organizationSchema = z.object({ name: z.string(), slug: z.string(), logo: z.string().nullable() });

const publicJobSchema = z.object({ slug: z.string(), content: publishedContentSchema, publishedAt: isoDate, updatedAt: isoDate });

export const publicCareersSchema = z.object({
  organization: organizationSchema,
  jobs: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      role: z.enum(JOB_ROLE_CHOICES),
      customRole: z.string().max(CUSTOM_ROLE_MAX).optional(),
      seniority: z.enum(SENIORITY_LEVELS),
      contractType: z.enum(CONTRACT_TYPES),
      workMode: z.enum(WORK_MODES),
      location: locationSchema,
      salary: salarySchema,
      stageCount: z.number().int(),
      responseDays: z.number().int(),
      publishedAt: isoDate,
      updatedAt: isoDate,
    }),
  ),
});

export const publicJobPageSchema = z.object({
  organization: organizationSchema,
  job: publicJobSchema,
});

export const publicOrganizationSummarySchema = organizationSchema.extend({
  careersUrl: z.string(),
  feedUrl: z.string(),
  openPositions: z.number().int().min(0),
});

export const publicFeedSchema = z.object({ organization: organizationSchema, jobs: z.array(publicJobSchema) });

export const suggestResultSchema = suggestResponsibilitiesResultSchema;
