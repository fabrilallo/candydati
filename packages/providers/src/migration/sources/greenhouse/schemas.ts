import { z } from 'zod';

/**
 * One Zod schema per Harvest v3 page (every list answers a bare array). Objects are NOT strict on purpose: a field the
 * connector does not name is dropped here, so nothing the package refuses (scorecards, ratings, EEOC data, salaries)
 * can travel further than the parse. Source: https://harvestdocs.greenhouse.io/reference/ (one page per endpoint).
 */
const id = z.number().int();
const text = z.string().nullish();
const date = z.string().nullish();

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  /** Seconds. The docs do not state a lifetime. */
  expires_in: z.number().positive().optional(),
});

export const userSchema = z.object({ id, first_name: text, last_name: text, name: text, primary_email: text, deactivated: z.boolean().nullish() });
export const jobSchema = z.object({ id, name: z.string(), status: z.enum(['open', 'draft', 'closed']), created_at: z.string(), opened_at: date, closed_at: date, is_template: z.boolean().nullish() });
export const stageSchema = z.object({ id, job_id: id, name: z.string(), sort_order: z.number().int(), active: z.boolean().nullish() });
export const candidateSchema = z.object({
  id,
  first_name: text,
  last_name: text,
  created_at: z.string(),
  tags: z.array(z.string()).nullish(),
  phone_numbers: z.array(z.object({ value: z.string() })).nullish(),
  email_addresses: z.array(z.object({ value: z.string() })).nullish(),
  social_media_addresses: z.array(z.object({ value: z.string() })).nullish(),
});
export const applicationSchema = z.object({
  id,
  candidate_id: id,
  job_id: id.nullish(),
  job_interview_stage_id: id.nullish(),
  source_id: id.nullish(),
  status: z.enum(['rejected', 'hired', 'converted', 'in_process']),
  created_at: z.string(),
  updated_at: z.string(),
  rejected_at: date,
  answers: z.array(z.object({ question: text, answer: text })).nullish(),
});
export const applicationStageSchema = z.object({ application_id: id, job_interview_stage_id: id, entered_at: date });
export const noteSchema = z.object({
  id,
  type: z.string(),
  candidate_id: id.nullish(),
  application_id: id.nullish(),
  user_id: id.nullish(),
  body: text,
  subject: text,
  visibility: text,
  email_from: text,
  email_to: text,
  created_at: z.string(),
});
export const attachmentSchema = z.object({ id, application_id: id, type: z.string(), filename: z.string(), url: z.string() });
export const sourceSchema = z.object({ id, name: z.string() });

export type GhUser = z.infer<typeof userSchema>;
export type GhJob = z.infer<typeof jobSchema>;
export type GhStage = z.infer<typeof stageSchema>;
export type GhCandidate = z.infer<typeof candidateSchema>;
export type GhApplication = z.infer<typeof applicationSchema>;
export type GhApplicationStage = z.infer<typeof applicationStageSchema>;
export type GhNote = z.infer<typeof noteSchema>;
export type GhAttachment = z.infer<typeof attachmentSchema>;

export const pageOf = <S extends z.ZodType>(item: S) => z.array(item);
