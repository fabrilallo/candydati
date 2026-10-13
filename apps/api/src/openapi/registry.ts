import { jobContentSchema, taskInputSchema, JOB_STATUSES, ATTENTION_STATES, NOTE_MAX, TAG_MAX, TAGS_PER_CANDIDATE_MAX, type Permission } from '@tt/domain';
import { z } from 'zod';
import {
  analyzeResultSchema,
  jobSchema,
  jobSummarySchema,
  jobTemplateSchema,
  publicCareersSchema,
  publicJobPageSchema,
  publishResultSchema,
} from './schemas-jobs.js';
import {
  attentionItemSchema,
  candidateDetailSchema,
  candidateSummarySchema,
  jobStatsSchema,
  noteSchema,
  pipelineSchema,
  taskSchema,
} from './schemas-work.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Schemas of the DTOs, documented once under `components.schemas` and referenced from every response. */
export const COMPONENT_SCHEMAS = {
  Job: jobSchema,
  JobSummary: jobSummarySchema,
  JobTemplate: jobTemplateSchema,
  PublishJobResult: publishResultSchema,
  AnalyzeJobAdResult: analyzeResultSchema,
  Pipeline: pipelineSchema,
  CandidateSummary: candidateSummarySchema,
  CandidateDetail: candidateDetailSchema,
  CandidateNote: noteSchema,
  AttentionItem: attentionItemSchema,
  Task: taskSchema,
  JobStats: jobStatsSchema,
  PublicCareers: publicCareersSchema,
  PublicJobPage: publicJobPageSchema,
} as const;
export type ComponentName = keyof typeof COMPONENT_SCHEMAS;

export interface RouteSpec {
  readonly method: HttpMethod;
  /** Fastify spelling (`:id`): the coverage test checks it against the real router. */
  readonly path: string;
  readonly tag: string;
  readonly summary: string;
  readonly description?: string;
  /** Scope the key needs. Null for public routes. */
  readonly scope: Permission | null;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  readonly status?: number;
  readonly response: {
    readonly schema: ComponentName | z.ZodType;
    readonly list?: boolean;
    readonly paginated?: boolean;
  };
}

const page = { page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional() };
const contentBody = z.object({ content: jobContentSchema });
const idResult = z.object({ id: z.string() });

const jobs: readonly RouteSpec[] = [
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
  { method: 'get', path: '/api/v1/stats/jobs', tag: 'Jobs', summary: 'Aggregates of the job ads', scope: 'job:read', response: { schema: 'JobStats' } },
  { method: 'get', path: '/api/v1/job-templates', tag: 'Templates', summary: 'List job templates', scope: 'job_template:read', response: { schema: 'JobTemplate', list: true } },
  {
    method: 'post', path: '/api/v1/job-templates', tag: 'Templates', summary: 'Create a job template', scope: 'job_template:create', status: 201,
    body: z.object({ name: z.string().min(1).max(80), content: jobContentSchema }), response: { schema: 'JobTemplate' },
  },
  { method: 'delete', path: '/api/v1/job-templates/:id', tag: 'Templates', summary: 'Delete a job template', scope: 'job_template:delete', response: { schema: idResult } },
];

const candidates: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/jobs/:id/pipeline', tag: 'Pipeline', summary: 'Pipeline of a job', scope: 'candidate:read',
    description: 'Stages generated from the declared process, with counts and one card per application. Read only: a key can neither move nor decide.',
    response: { schema: 'Pipeline' },
  },
  {
    method: 'get', path: '/api/v1/applications/attention', tag: 'Pipeline', summary: 'Applications due soon or overdue', scope: 'candidate:read',
    query: z.object({ state: z.enum(ATTENTION_STATES).optional(), ...page }), response: { schema: 'AttentionItem', list: true, paginated: true },
  },
  {
    method: 'get', path: '/api/v1/candidates', tag: 'Candidates', summary: 'Search candidates', scope: 'candidate:read',
    query: z.object({ query: z.string().max(100).optional(), tag: z.string().max(TAG_MAX).optional(), talentPool: z.boolean().optional(), ...page }),
    response: { schema: 'CandidateSummary', list: true, paginated: true },
  },
  {
    method: 'get', path: '/api/v1/candidates/:id', tag: 'Candidates', summary: 'Read a candidate profile', scope: 'candidate:read',
    description: 'Personal data: every read is recorded in the audit log.', response: { schema: 'CandidateDetail' },
  },
  {
    method: 'patch', path: '/api/v1/candidates/:id', tag: 'Candidates', summary: 'Replace the tags of a candidate', scope: 'candidate:update',
    body: z.object({ tags: z.array(z.string().min(1).max(TAG_MAX)).max(TAGS_PER_CANDIDATE_MAX) }), response: { schema: 'CandidateDetail' },
  },
  {
    method: 'post', path: '/api/v1/candidates/:id/notes', tag: 'Candidates', summary: 'Add a note', scope: 'candidate_note:create', status: 201,
    body: z.object({ body: z.string().min(1).max(NOTE_MAX), applicationId: z.string().min(1).optional() }), response: { schema: 'CandidateNote' },
  },
  { method: 'get', path: '/api/v1/tasks', tag: 'Tasks', summary: 'List tasks', scope: 'task:read',
    query: z.object({ mine: z.boolean().optional(), open: z.boolean().optional() }), response: { schema: 'Task', list: true } },
  { method: 'get', path: '/api/v1/applications/:id/tasks', tag: 'Tasks', summary: 'Tasks of an application', scope: 'task:read', response: { schema: 'Task', list: true } },
  { method: 'post', path: '/api/v1/tasks', tag: 'Tasks', summary: 'Create a task', scope: 'task:manage', status: 201, body: taskInputSchema, response: { schema: 'Task' } },
  { method: 'post', path: '/api/v1/tasks/:id/complete', tag: 'Tasks', summary: 'Complete a task', scope: 'task:manage', response: { schema: 'Task' } },
  { method: 'post', path: '/api/v1/tasks/:id/reopen', tag: 'Tasks', summary: 'Reopen a task', scope: 'task:manage', response: { schema: 'Task' } },
];

const publicRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/public/organizations/:orgSlug/jobs', tag: 'Public careers', summary: 'Published ads of an organization', scope: null,
    response: { schema: 'PublicCareers' },
  },
  {
    method: 'get', path: '/api/v1/public/organizations/:orgSlug/jobs/:jobSlug', tag: 'Public careers', summary: 'A published ad', scope: null,
    response: { schema: 'PublicJobPage' },
  },
];

/** Every `/api/v1` route that works with an API key, each paired with the Zod schemas of its input and output. */
export const ROUTE_REGISTRY: readonly RouteSpec[] = [...jobs, ...candidates, ...publicRoutes];
