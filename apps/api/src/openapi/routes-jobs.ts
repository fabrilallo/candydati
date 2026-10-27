import { CUSTOM_ROLE_MAX, JOB_ROLES, JOB_STATUSES, SENIORITY_LEVELS, SUPPORTED_LOCALES, jobContentSchema } from '@candydati/domain';
import { z } from 'zod';
import { idResult, page, type RouteSpec } from './spec.js';

const contentBody = z.object({ content: jobContentSchema });

export const jobRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/jobs', tag: 'Jobs', summary: 'List job ads', scope: 'job:read',
    query: z.object({ status: z.enum(JOB_STATUSES).optional(), ...page }),
    response: { schema: 'JobSummary', list: true, paginated: true },
  },
  {
    method: 'post', path: '/api/v1/jobs', tag: 'Jobs', summary: 'Create a draft', scope: 'job:create', status: 201,
    description: 'Always a draft. With `templateId` the template is the base and `content` overrides it field by field, so `title` may then be omitted.',
    body: z.object({ content: jobContentSchema.partial({ title: true }), templateId: z.string().min(1).optional() }),
    response: { schema: 'Job' },
  },
  { method: 'get', path: '/api/v1/jobs/:id', tag: 'Jobs', summary: 'Read a job ad', scope: 'job:read', response: { schema: 'Job' } },
  {
    method: 'put', path: '/api/v1/jobs/:id', tag: 'Jobs', summary: 'Replace the content of a job ad', scope: 'job:update', body: contentBody,
    description: 'Full replacement. A published ad must keep satisfying the publication rules; a closed ad cannot be edited.',
    response: { schema: 'Job' },
  },
  {
    method: 'post', path: '/api/v1/jobs/:id/publish', tag: 'Jobs', summary: 'Publish a draft', scope: 'job:publish',
    description: 'Needs salary range, the selection process and the response time (RAL and declared process), plus an active privacy notice. `422` lists what is missing.',
    response: { schema: 'PublishJobResult' },
  },
  { method: 'post', path: '/api/v1/jobs/:id/close', tag: 'Jobs', summary: 'Close a job ad', scope: 'job:close', response: { schema: 'Job' } },
  {
    method: 'post', path: '/api/v1/jobs/quality', tag: 'Jobs', summary: 'Analyze unsaved content', scope: 'job:update', body: contentBody,
    description: 'Quality feedback and the publication issues of content that is not saved. Changes nothing.',
    response: { schema: 'AnalyzeJobAdResult' },
  },
  {
    method: 'post', path: '/api/v1/jobs/responsibilities/suggest', tag: 'Jobs', summary: 'Propose responsibilities for an ad', scope: 'job:update',
    description: 'Asks the fast model for 3 to 6 responsibilities from the title, role, seniority and language (and the lines already written, to avoid repeats). Needs a title, a role or a `customRole` (a role written by hand, sent instead of `role`). Nothing is saved; `status` is `proposed`, `unavailable` (no fast model on this instance) or `failed`.',
    body: z.object({
      title: z.string().optional(), role: z.enum(JOB_ROLES).optional(), customRole: z.string().max(CUSTOM_ROLE_MAX).optional(), seniority: z.enum(SENIORITY_LEVELS).optional(),
      language: z.enum(SUPPORTED_LOCALES).optional(), existing: z.array(z.string()).optional(), summary: z.string().optional(),
    }),
    response: { schema: 'SuggestResponsibilitiesResult' },
  },
  { method: 'get', path: '/api/v1/stats/jobs', tag: 'Jobs', summary: 'Aggregates of the job ads', scope: 'job:read', response: { schema: 'JobStats' } },
  { method: 'get', path: '/api/v1/job-templates', tag: 'Templates', summary: 'List job templates', scope: 'job_template:read', response: { schema: 'JobTemplate', list: true } },
  {
    method: 'post', path: '/api/v1/job-templates', tag: 'Templates', summary: 'Create a job template', scope: 'job_template:create', status: 201,
    body: z.object({ name: z.string().min(1).max(80), content: jobContentSchema }), response: { schema: 'JobTemplate' },
  },
  { method: 'delete', path: '/api/v1/job-templates/:id', tag: 'Templates', summary: 'Delete a job template', scope: 'job_template:delete', response: { schema: idResult } },
];
