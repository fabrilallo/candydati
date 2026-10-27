import { z } from 'zod';
import { JOB_REQUEST_STATUSES } from '../job-request/job-request.js';
import { locationSchema } from '../job/content.js';
import { CUSTOM_ROLE_MAX, JOB_ROLE_CHOICES, SALARY_CURRENCIES, SENIORITY_LEVELS, WORK_MODES } from '../job/taxonomy.js';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import { isoDate } from './common.js';

/**
 * Job requests and approval on the wire. The api returns the core entities as they are (`JobRequest`, `JobApproval`,
 * `JobApprovalStatus`), serialised to JSON: people are user ids (the web names them from the team list), optional
 * fields are absent rather than null, and the internal `organizationId` is ignored by the schemas.
 */
export const jobRequestSchema = z.object({
  id: z.string(),
  title: z.string(),
  role: z.enum(JOB_ROLE_CHOICES).optional(),
  customRole: z.string().max(CUSTOM_ROLE_MAX).optional(),
  seniority: z.enum(SENIORITY_LEVELS).optional(),
  reason: z.string(),
  headcount: z.number().int().positive(),
  salaryMin: z.number(),
  salaryMax: z.number(),
  currency: z.enum(SALARY_CURRENCIES),
  workMode: z.enum(WORK_MODES).optional(),
  location: locationSchema,
  desiredStart: z.string().optional(),
  processNotes: z.string(),
  interviewersNotes: z.string(),
  language: z.enum(SUPPORTED_LOCALES),
  status: z.enum(JOB_REQUEST_STATUSES),
  requestedBy: z.string(),
  decidedBy: z.string().nullable(),
  decidedAt: isoDate.nullable(),
  decisionNote: z.string().nullable(),
  jobId: z.string().nullable(),
  createdAt: isoDate,
});
export type JobRequestDto = z.output<typeof jobRequestSchema>;

export const approvalSettingsSchema = z.object({ requireApproval: z.boolean() });

/** What an approver signed off (`JobApproval`): the ad may be published inside this annual range. */
export const jobApprovalSchema = z.object({
  approvedBy: z.string(),
  approvedAt: isoDate,
  salaryMin: z.number(),
  salaryMax: z.number(),
  currency: z.enum(SALARY_CURRENCIES),
});
export type JobApprovalDto = z.output<typeof jobApprovalSchema>;

/** `GET /jobs/:id/approval`: does the organization ask for approval, and does this job have one. */
export const jobApprovalStatusSchema = z.object({ requireApproval: z.boolean(), approval: jobApprovalSchema.nullable(), publishable: z.boolean() });
export type JobApprovalStatusDto = z.output<typeof jobApprovalStatusSchema>;
