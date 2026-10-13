import { createTool } from '@mastra/core/tools';
import { analyzeJobAd, authorize, ConflictError, getJob, listJobTemplates, listJobs, updateJob, ValidationError, type JobDeps } from '@tt/core';
import { checkPublishable, JOB_STATUSES, jobContentSchema, type Job } from '@tt/domain';
import { z } from 'zod';
import { BRIEF_MAX, type JobDrafter } from '../job-drafter.js';
import { readAgentIdentity } from '../request-context.js';
import { refusal, runTool } from '../tool-result.js';

const jobId = z.string().min(1).max(100).describe('Id of a job of this organization');

const jobSummary = (job: Job) => ({ id: job.id, title: job.content.title, status: job.status });

export const createGetJobTool = (deps: JobDeps) =>
  createTool({
    id: 'get_job',
    description: 'Reads one job ad of this organization: status (draft, published, closed), content and what still blocks publication.',
    inputSchema: z.object({ jobId }),
    execute: async (input, context) =>
      runTool(async () => {
        const job = await getJob(deps, readAgentIdentity(context?.requestContext).actor, input);
        return { ...jobSummary(job), content: job.content, publishIssues: checkPublishable(job.content) };
      }),
  });

export const createListJobsTool = (deps: JobDeps) =>
  createTool({
    id: 'list_jobs',
    description: 'Lists the job ads of this organization (id, title, status), newest first. Use it to find a job id.',
    inputSchema: z.object({ status: z.enum(JOB_STATUSES).optional() }),
    execute: async (input, context) =>
      runTool(async () => {
        const page = await listJobs(deps, readAgentIdentity(context?.requestContext).actor, { ...input, limit: 50 });
        return { jobs: page.items.map(jobSummary), total: page.meta.total };
      }),
  });

export const createListJobTemplatesTool = (deps: JobDeps) =>
  createTool({
    id: 'list_job_templates',
    description: 'Lists the job ad templates of this organization (id, name, title of the template content).',
    inputSchema: z.object({}),
    execute: async (_input, context) =>
      runTool(async () => {
        const templates = await listJobTemplates(deps, readAgentIdentity(context?.requestContext).actor, {});
        return { templates: templates.map((t) => ({ id: t.id, name: t.name, title: t.content.title })) };
      }),
  });

export const createAnalyzeJobAdTool = (deps: JobDeps) =>
  createTool({
    id: 'analyze_job_ad',
    description:
      'Checks a job ad: the quality score with its suggestions and the rules that block publication. Pass jobId for a saved ad or content for a proposal. It changes nothing.',
    inputSchema: z.object({ jobId: jobId.nullish(), content: jobContentSchema.nullish() }),
    execute: async (input, context) =>
      runTool(async () => {
        const { actor } = readAgentIdentity(context?.requestContext);
        const content = input.content ?? (input.jobId ? (await getJob(deps, actor, { jobId: input.jobId })).content : null);
        if (!content) throw new ValidationError([{ path: 'jobId', message: 'jobId or content is required' }]);
        return analyzeJobAd(deps, actor, { content });
      }),
  });

export const createUpdateJobDraftTool = (deps: JobDeps) =>
  createTool({
    id: 'update_job_draft',
    description:
      'Saves new content on a job ad that is still a DRAFT (full replacement of the content). Refuses published and closed ads. It never publishes: publishing is done by a person from the job page. Only call it after the user asked to save.',
    inputSchema: z.object({ jobId, content: jobContentSchema }),
    execute: async (input, context) =>
      runTool(async () => {
        const { actor } = readAgentIdentity(context?.requestContext);
        const notDraft = () => refusal('not_a_draft', 'Only drafts can be changed by the assistant; a person edits published ads.');
        // Only a friendly early answer: the rule itself is core's (updateJob refuses an agent on a non-draft, and the
        // write is guarded on the status it read, so a publish in between is a conflict, never an overwrite).
        if ((await getJob(deps, actor, { jobId: input.jobId })).status !== 'draft') return notDraft();
        const saved = await updateJob(deps, actor, input).catch((error: unknown) => {
          if (error instanceof ConflictError) return null;
          throw error;
        });
        if (!saved) return notDraft();
        return { saved: true, ...jobSummary(saved), publishIssues: checkPublishable(saved.content) };
      }),
  });

/** The model call can fail (timeout, invalid structured output): the chat goes on with a short code, the cause is logged. */
async function proposeContent(draft: JobDrafter, input: Parameters<JobDrafter>[0], onError: (error: unknown, tool: string) => void) {
  try {
    return { proposal: await draft(input) };
  } catch (error) {
    onError(error, 'draft_job_content');
    return null;
  }
}

export const createDraftJobContentTool = (deps: JobDeps, draft: JobDrafter, onError: (error: unknown, tool: string) => void = () => undefined) =>
  createTool({
    id: 'draft_job_content',
    description:
      'Writes a job ad proposal (JobContent) from a brief, optionally improving an existing ad (jobId). Nothing is saved: show the proposal and save it with update_job_draft only if the user asks.',
    inputSchema: z.object({
      brief: z.string().trim().min(1).max(BRIEF_MAX).describe('What the ad must say, in the words of the user'),
      jobId: jobId.optional(),
      language: z.enum(['it', 'en']).default('it'),
    }),
    execute: async (input, context) =>
      runTool(async () => {
        const { actor } = readAgentIdentity(context?.requestContext);
        authorize(actor, 'job:update');
        const base = input.jobId ? (await getJob(deps, actor, { jobId: input.jobId })).content : null;
        const result = await proposeContent(draft, { brief: input.brief, base, language: input.language }, onError);
        if (!result) return refusal('draft_failed', 'The proposal could not be generated this time; try again or write a shorter brief.');
        return { proposal: result.proposal, saved: false, publishIssues: checkPublishable(result.proposal) };
      }),
  });
