import {
  analyzeJobAd,
  createJob,
  getJob,
  getPipeline,
  listJobs,
  publishJob,
  toJobDto,
  toJobSummaryDto,
  toPublishJobResultDto,
  updateJob,
} from '@candydati/core';
import { JOB_STATUSES, jobContentSchema, type PublishRule } from '@candydati/domain';
import { z } from 'zod';
import { toMcpPipeline } from './pipeline-view.js';
import type { ToolDefinition } from './tool-support.js';

const jobId = z.string().min(1).describe('Id of the job ad, from list_jobs.');

/**
 * The same shape as the ad content without defaults: a field the caller leaves out stays absent, so a template's value
 * is not overwritten by a default (`create_job` merges the given fields over the template).
 */
const draftContent = z.object(
  Object.fromEntries(
    Object.entries(jobContentSchema.shape).map(([key, field]) => [key, (field instanceof z.ZodDefault ? field.unwrap() : field).optional()]),
  ),
).describe('Fields of the ad. Only the title is required (or a templateId instead). Everything else can be filled in later with update_job.');

const RULE_HINTS: Readonly<Record<PublishRule, string>> = {
  required: 'This field is required before publication.',
  salary_max_below_min: 'The maximum salary (RAL) is lower than the minimum.',
  city_required: 'Hybrid and onsite roles need a city.',
  onsite_days_required: 'Hybrid and onsite roles need the days per week in the office.',
  too_few_stages: 'Declare the selection process: at least one stage.',
  too_few_responsibilities: 'List at least three responsibilities.',
  too_few_requirements: 'List at least one must-have requirement.',
  gender_exclusive_title: 'The title must address both sexes (D.Lgs. 198/2006): add "(m/f)" or a form like "Sviluppatore/trice".',
  gender_requirement: 'Remove the requirement on sex: an ad cannot ask for a man or a woman.',
  discriminatory_requirement: 'Remove the discriminatory requirement (age, nationality, appearance, family status, religion, opinions).',
};

export const listJobsTool = {
  name: 'list_jobs',
  title: 'List job ads',
  description: 'List the organization\'s job ads (drafts, published, closed), newest first, with whether each draft is publishable. Read only.',
  shape: { status: z.enum(JOB_STATUSES).optional(), page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional() },
  readOnly: true,
  run: async ({ app, actor }, input) => {
    const { items, meta } = await listJobs(app.jobDeps, actor, input);
    return { items: items.map((job) => toJobSummaryDto(job, app.jobDeps)), meta };
  },
} satisfies ToolDefinition<{ status: z.ZodOptional<z.ZodEnum<{ draft: 'draft'; published: 'published'; closed: 'closed' }>>; page: z.ZodOptional<z.ZodNumber>; limit: z.ZodOptional<z.ZodNumber> }>;

export const getJobTool = {
  name: 'get_job',
  title: 'Read a job ad',
  description: 'Read one job ad with its full content, status, quality report (null while the instance has no AI model) and the publication issues still open. Read only.',
  shape: { jobId },
  readOnly: true,
  run: async ({ app, actor }, input) => toJobDto(await getJob(app.jobDeps, actor, input), app.jobDeps),
} satisfies ToolDefinition<{ jobId: typeof jobId }>;

export const createJobTool = {
  name: 'create_job',
  title: 'Create a draft job ad',
  description:
    'Create a DRAFT job ad (never published by this call). Every ad must declare, before it can be published: role, seniority, contract type, ' +
    'a salary range (RAL min and max), work mode (with city and office days if hybrid or onsite), country, the selection process (stages with ' +
    'type, duration and who conducts them), the days within which candidates hear back, at least three responsibilities and one must-have requirement. ' +
    'Optionally start from a template with templateId. Use check_publishable to see what is missing.',
  shape: { content: draftContent, templateId: z.string().min(1).optional().describe('A template from list_job_templates to start from.') },
  readOnly: false,
  run: async ({ app, actor }, input) => toJobDto(await createJob(app.jobDeps, actor, input), app.jobDeps),
} satisfies ToolDefinition<{ content: typeof draftContent; templateId: z.ZodOptional<z.ZodString> }>;

export const updateJobTool = {
  name: 'update_job',
  title: 'Update a job ad',
  description:
    'Replace the whole content of a draft or published job ad (send the complete content: read it with get_job first and change what you need). ' +
    'A published ad must keep satisfying the publication rules; a closed ad cannot be edited. The status never changes here: use publish_job to publish.',
  shape: { jobId, content: jobContentSchema },
  readOnly: false,
  run: async ({ app, actor }, input) => toJobDto(await updateJob(app.jobDeps, actor, input), app.jobDeps),
} satisfies ToolDefinition<{ jobId: typeof jobId; content: typeof jobContentSchema }>;

export const analyzeJobAdTool = {
  name: 'analyze_job_ad',
  title: 'Analyze a job ad',
  description:
    'Score the quality of ad content that is not saved (vague phrases, missing transparency) and list its publication issues. ' +
    'The score needs an AI model: without one status is "unavailable", assessment is null and only the publication issues are listed. ' +
    'It scores the ad, never people. Changes nothing.',
  shape: { content: jobContentSchema },
  readOnly: true,
  usesModel: true,
  run: async ({ app, actor }, input) => analyzeJobAd(app.jobDeps, actor, input),
} satisfies ToolDefinition<{ content: typeof jobContentSchema }>;

export const checkPublishableTool = {
  name: 'check_publishable',
  title: 'Check a job ad can be published',
  description:
    'List the publication rules a saved job ad still fails (an empty list means it can be published). A published ad needs the RAL (salary min and max), ' +
    'the declared selection process, the response time, work mode details, at least three responsibilities and one must-have requirement. Read only.',
  shape: { jobId },
  readOnly: true,
  run: async ({ app, actor }, input) => {
    const { id, status, publishIssues } = toJobDto(await getJob(app.jobDeps, actor, input), app.jobDeps);
    return {
      jobId: id,
      status,
      publishable: publishIssues.length === 0,
      issues: publishIssues.map((issue) => ({ ...issue, hint: RULE_HINTS[issue.rule] })),
    };
  },
} satisfies ToolDefinition<{ jobId: typeof jobId }>;

export const publishJobTool = {
  name: 'publish_job',
  title: 'Publish a job ad',
  description:
    'Publish a DRAFT job ad. Refused (with the list of what is missing) unless the ad declares the RAL and the selection process and passes every publication rule, ' +
    'and the organization has an active privacy notice. Needs the job:publish scope. A quality score below the threshold is flagged, not blocking; without an AI model there is no score (qualityStatus unavailable).',
  shape: { jobId },
  readOnly: false,
  usesModel: true,
  run: async ({ app, actor }, input) => toPublishJobResultDto(await publishJob(app.jobDeps, actor, input), app.jobDeps),
} satisfies ToolDefinition<{ jobId: typeof jobId }>;

export const getPipelineTool = {
  name: 'get_pipeline',
  title: 'Read the pipeline of a job',
  description:
    'Where the applications of a job stand: the stages with how many open applications each has, and one card per application with the candidate\'s first name and id (never the surname), ' +
    'stage, outcome and response state (on_track, due_soon, overdue, answered, closed). No CV text, messages or notes. ' +
    'Read only: there is no tool to move, decide on, message or erase a candidate, those stay with a person.',
  shape: { jobId },
  readOnly: true,
  run: async ({ app, actor }, input) => toMcpPipeline(await getPipeline(app.candidateDeps, actor, input)),
} satisfies ToolDefinition<{ jobId: typeof jobId }>;
