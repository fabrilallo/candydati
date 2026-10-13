import { jobContentSchema, taskInputSchema, JOB_STATUSES, ATTENTION_STATES, NOTE_MAX, TAG_MAX, TAGS_PER_CANDIDATE_MAX, type Permission } from '@tt/domain';
import { z } from 'zod';
import {
  analyzeResultSchema,
  jobSchema,
  jobSummarySchema,
  jobTemplateSchema,
  publicCareersSchema,
  publicFeedSchema,
  publicJobPageSchema,
  publicOrganizationSummarySchema,
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
import {
  applicationFeedbackSchema,
  approvalSettingSchema,
  feedbackRequestViewSchema,
  jobApprovalStatusSchema,
  jobRequestSchema,
  publicFeedbackSchema,
  stageInterviewersSchema,
  staleJobSchema,
  submitFeedbackBody,
} from './schemas-hr.js';
import { consentAnswerBody, consentRequestSchema, importBatchPageSchema, importBatchSchema, importUploadBody, undoImportSchema } from './schemas-import.js';
import { interviewerInputSchema, jobRequestInputSchema, JOB_REQUEST_STATUSES } from '@tt/domain';
import { importItemSelectionSchema, importMappingSchema, IMPORT_CONFIDENCES, IMPORT_ITEMS_PAGE_MAX } from '@tt/domain';

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
  ImportBatch: importBatchSchema,
  ImportBatchPage: importBatchPageSchema,
  UndoImportResult: undoImportSchema,
  ConsentRequest: consentRequestSchema,
  PublicCareers: publicCareersSchema,
  PublicJobPage: publicJobPageSchema,
  PublicOrganizationSummary: publicOrganizationSummarySchema,
  PublicFeed: publicFeedSchema,
  StageInterviewers: stageInterviewersSchema,
  ApplicationFeedback: applicationFeedbackSchema,
  FeedbackRequest: feedbackRequestViewSchema,
  PublicFeedbackForm: publicFeedbackSchema,
  JobRequest: jobRequestSchema,
  ApprovalSetting: approvalSettingSchema,
  JobApprovalStatus: jobApprovalStatusSchema,
  StaleJob: staleJobSchema,
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
  /** The body is `multipart/form-data` instead of JSON. */
  readonly multipart?: boolean;
  /** Session only: an API key is refused. `scope` then names the permission, not an API key scope. */
  readonly sessionOnly?: boolean;
  readonly status?: number;
  readonly response: {
    readonly schema: ComponentName | z.ZodType;
    readonly list?: boolean;
    readonly paginated?: boolean;
  };
}

const page = { page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional() };
function approvalSettingBody() {
  return z.object({ requireApproval: z.boolean() });
}
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


const importRoutes: readonly RouteSpec[] = [
  {
    method: 'post', path: '/api/v1/imports', tag: 'Import', summary: 'Upload files to import', scope: 'import:manage', sessionOnly: true, status: 201, multipart: true,
    description: 'Fields `jobId`, `stageId`, then up to 1000 `files`: ZIP of CVs (PDF, DOCX), CSV, XLSX or a Notion export, 200 MB in total. Types are decided from the content, never the name. The analysis runs in the background: poll the batch until `ready` or `failed`.',
    body: importUploadBody, response: { schema: z.object({ id: z.string(), status: z.string() }) },
  },
  { method: 'get', path: '/api/v1/imports', tag: 'Import', summary: 'List import batches', scope: 'import:manage', sessionOnly: true, response: { schema: 'ImportBatch', list: true } },
  {
    method: 'get', path: '/api/v1/imports/:id', tag: 'Import', summary: 'Preview of an import', scope: 'import:manage', sessionOnly: true,
    description: 'The batch and one page of the proposed people, each with its confidence (`high`, `medium`, `low`), conflicts and missing data.',
    query: z.object({ page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(IMPORT_ITEMS_PAGE_MAX).optional(), confidence: z.enum(IMPORT_CONFIDENCES).optional() }),
    response: { schema: 'ImportBatchPage' },
  },
  {
    method: 'put', path: '/api/v1/imports/:id/mapping', tag: 'Import', summary: 'Change the column mapping', scope: 'import:manage', sessionOnly: true,
    description: 'Runs the matching again over the stored CVs and rows. Include/exclude choices made before are lost.',
    body: z.object({ mapping: importMappingSchema }), response: { schema: 'ImportBatchPage' },
  },
  {
    method: 'put', path: '/api/v1/imports/:id/items', tag: 'Import', summary: 'Include or exclude people, change the target', scope: 'import:manage', sessionOnly: true,
    body: z.object({ items: z.array(importItemSelectionSchema).optional(), target: z.object({ jobId: z.string(), stageId: z.string() }).optional() }),
    response: { schema: 'ImportBatchPage' },
  },
  {
    method: 'post', path: '/api/v1/imports/:id/commit', tag: 'Import', summary: 'Confirm the import', scope: 'import:manage', sessionOnly: true, status: 202,
    description: 'Queues the commit: candidates and applications are created with consent still to be renewed, visible only in the pipeline of the target job, and each person with an email gets a reconfirmation link.',
    response: { schema: 'ImportBatch' },
  },
  {
    method: 'post', path: '/api/v1/imports/:id/undo', tag: 'Import', summary: 'Undo an import', scope: 'import:manage', sessionOnly: true,
    description: 'Erases everything the batch created, except people who already reconfirmed (their data is theirs to keep): those are counted in `skippedReconfirmed`.',
    response: { schema: 'UndoImportResult' },
  },
];

const hrRoutes: readonly RouteSpec[] = [
  { method: 'get', path: '/api/v1/jobs/stale', tag: 'Jobs', summary: 'Published ads with no activity for 90 days', scope: 'job:read',
    description: 'Idle since publication, last edit, last application or last move or decision. Listed only: nothing closes an ad automatically.', response: { schema: 'StaleJob', list: true } },
  { method: 'get', path: '/api/v1/jobs/:id/interviewers', tag: 'Feedback', summary: 'Interviewers of a job, per stage', scope: 'feedback:read', response: { schema: 'StageInterviewers', list: true } },
  {
    method: 'put', path: '/api/v1/jobs/:id/interviewers', tag: 'Feedback', summary: 'Set the interviewers of a job', scope: 'feedback:manage',
    description: 'The list replaces the whole configuration. When an application enters a stage, each interviewer of the stage receives a personal link to leave feedback without an account.',
    body: z.object({ stages: z.array(z.object({ stageId: z.string().min(1), interviewers: z.array(interviewerInputSchema).max(5) })).max(20) }),
    response: { schema: 'StageInterviewers', list: true },
  },
  {
    method: 'get', path: '/api/v1/applications/:id/feedback', tag: 'Feedback', summary: 'Feedback of an application', scope: 'feedback:read',
    description: 'Who was asked, who answered and what they wrote. Feedback has no score: only answers and an opinion on the next step.', response: { schema: 'ApplicationFeedback' },
  },
  {
    method: 'post', path: '/api/v1/applications/:id/feedback/request', tag: 'Feedback', summary: 'Ask for feedback by hand', scope: 'feedback:manage', status: 201,
    description: 'For the configured interviewers of the stage (default: the current one), or for the one given in `interviewer`. Sends a new link each time.',
    body: z.object({ stageId: z.string().min(1).optional(), interviewer: interviewerInputSchema.optional() }), response: { schema: 'FeedbackRequest', list: true },
  },
  {
    method: 'get', path: '/api/v1/job-requests', tag: 'Job requests', summary: 'List requests for a position', scope: 'job:read',
    query: z.object({ status: z.enum(JOB_REQUEST_STATUSES).optional(), ...page }), response: { schema: 'JobRequest', list: true, paginated: true },
  },
  { method: 'post', path: '/api/v1/job-requests', tag: 'Job requests', summary: 'Request a position', scope: 'job:create', status: 201, body: jobRequestInputSchema, response: { schema: 'JobRequest' } },
  { method: 'get', path: '/api/v1/job-requests/:id', tag: 'Job requests', summary: 'Read a request', scope: 'job:read', response: { schema: 'JobRequest' } },
  {
    method: 'post', path: '/api/v1/job-requests/:id/approve', tag: 'Job requests', summary: 'Approve a request', scope: 'job:approve', sessionOnly: true,
    body: z.object({ note: z.string().max(2000).optional() }), response: { schema: 'JobRequest' },
  },
  {
    method: 'post', path: '/api/v1/job-requests/:id/reject', tag: 'Job requests', summary: 'Reject a request', scope: 'job:approve', sessionOnly: true,
    body: z.object({ note: z.string().min(1).max(2000) }), response: { schema: 'JobRequest' },
  },
  {
    method: 'post', path: '/api/v1/job-requests/:id/convert', tag: 'Job requests', summary: 'Turn a request into a draft', scope: 'job:create', status: 201,
    description: 'With approval on the request must be approved first; the draft carries the approved range, and publishing beyond it is refused.', response: { schema: 'Job' },
  },
  { method: 'get', path: '/api/v1/settings/approval', tag: 'Job requests', summary: 'Is approval required to publish', scope: 'job:read', response: { schema: 'ApprovalSetting' } },
  { method: 'put', path: '/api/v1/settings/approval', tag: 'Job requests', summary: 'Turn approval on or off', scope: 'job:approve', sessionOnly: true, body: approvalSettingBody(), response: { schema: 'ApprovalSetting' } },
  { method: 'get', path: '/api/v1/jobs/:id/approval', tag: 'Job requests', summary: 'Approval status of a job', scope: 'job:read', response: { schema: 'JobApprovalStatus' } },
  {
    method: 'post', path: '/api/v1/jobs/:id/approval-request', tag: 'Job requests', summary: 'Ask approval for a draft', scope: 'job:create', status: 201,
    body: z.object({ reason: z.string().min(1).max(4000) }), response: { schema: 'JobRequest' },
  },
];

const publicRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/public/organizations/:orgSlug', tag: 'Public', summary: 'An organization', scope: null,
    description: 'Name, logo, the careers page and feed URLs, and how many ads are open. No authentication; open to any origin (CORS `*`, no credentials).',
    response: { schema: 'PublicOrganizationSummary' },
  },
  {
    method: 'get', path: '/api/v1/public/organizations/:orgSlug/jobs', tag: 'Public', summary: 'Published ads of an organization', scope: null,
    description: 'One summary per published ad, newest first. Drafts and closed ads never appear.',
    response: { schema: 'PublicCareers' },
  },
  {
    method: 'get', path: '/api/v1/public/organizations/:orgSlug/feed', tag: 'Public', summary: 'Full content of the published ads', scope: null,
    description: 'The complete public content of every published ad (what the XML feed, `llms.txt` and the sitemap are built from).',
    response: { schema: 'PublicFeed' },
  },
  {
    method: 'get', path: '/api/v1/public/organizations/:orgSlug/jobs/:jobSlug', tag: 'Public', summary: 'A published ad', scope: null,
    response: { schema: 'PublicJobPage' },
  },
  {
    method: 'get', path: '/api/v1/public/consent/:token', tag: 'Public', summary: 'Reconfirmation page of an imported candidate', scope: null,
    description: 'The single-use link token is the only credential. Unknown or expired: 404. Already answered: 409. Never cached, not open to other origins.',
    response: { schema: 'ConsentRequest' },
  },
  {
    method: 'post', path: '/api/v1/public/consent/:token', tag: 'Public', summary: 'Answer a reconfirmation', scope: null,
    description: 'Send `scopes` (with `selection`) to give consent against the active privacy notice, or `decline: true` to have the data erased at once.',
    body: consentAnswerBody, response: { schema: z.object({ status: z.enum(['reconfirmed', 'declined']) }) },
  },
  {
    method: 'get', path: '/api/v1/public/feedback/:token', tag: 'Public', summary: 'Interview feedback form', scope: null,
    description: 'For the person who conducted a stage. The personal link token is the only credential. Shows only what the interviewer needs: first and last name of the candidate, job title, stage and its note, the questions. Unknown or expired: 404. Never cached, not open to other origins.',
    response: { schema: 'PublicFeedbackForm' },
  },
  {
    method: 'post', path: '/api/v1/public/feedback/:token', tag: 'Public', summary: 'Submit interview feedback', scope: null,
    description: 'Single use: a second submission is `409`. Only `answers` and `recommendation` are accepted; any other field, such as a score, is refused with `422`. The recommendation is an opinion for the person who decides.',
    body: submitFeedbackBody, response: { schema: z.object({ submittedAt: z.iso.datetime() }) },
  },
];

/** Every `/api/v1` route that works with an API key, each paired with the Zod schemas of its input and output. */
export const ROUTE_REGISTRY: readonly RouteSpec[] = [...jobs, ...candidates, ...importRoutes, ...hrRoutes, ...publicRoutes];
