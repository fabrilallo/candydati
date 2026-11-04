import { JOB_REQUEST_STATUSES, interviewerInputSchema, jobRequestInputSchema } from '@candydati/domain';
import { z } from 'zod';
import { jobScorecardSchema, scorecardBody, suggestScorecardResultSchema } from './schemas-hr.js';
import { page, type RouteSpec } from './spec.js';

export const hrRoutes: readonly RouteSpec[] = [
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
    method: 'get', path: '/api/v1/jobs/:id/scorecard', tag: 'Feedback', summary: 'Evaluation criteria of a job', scope: 'feedback:read',
    description: 'What interviewers look for, declared before the interviews, for every stage (`stageId` null) or one. No weight and no score: for each criterion an interviewer records `observed`, `not_observed` or `to_explore` with evidence.',
    response: { schema: jobScorecardSchema },
  },
  {
    method: 'put', path: '/api/v1/jobs/:id/scorecard', tag: 'Feedback', summary: 'Set the evaluation criteria of a job', scope: 'feedback:manage',
    description: 'The list replaces the active criteria, in order. A criterion is editable until a feedback uses it (`locked`); after that its words and stage are fixed (`422 criterion_in_use`) and leaving it out retires it, so past feedback reads as written.',
    body: scorecardBody, response: { schema: jobScorecardSchema },
  },
  {
    method: 'post', path: '/api/v1/jobs/:id/scorecard/suggest', tag: 'Feedback', summary: 'Draft evaluation criteria from the ad', scope: 'feedback:manage',
    description: 'The fast model reads the ad only (never a candidate) and proposes short labels. Nothing is saved: the person keeps the ones they want. `unavailable` without a model, `failed` when the answer was unusable.',
    response: { schema: suggestScorecardResultSchema },
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
  { method: 'put', path: '/api/v1/settings/approval', tag: 'Job requests', summary: 'Turn approval on or off', scope: 'job:approve', sessionOnly: true, body: z.object({ requireApproval: z.boolean() }), response: { schema: 'ApprovalSetting' } },
  { method: 'get', path: '/api/v1/jobs/:id/approval', tag: 'Job requests', summary: 'Approval status of a job', scope: 'job:read', response: { schema: 'JobApprovalStatus' } },
  {
    method: 'post', path: '/api/v1/jobs/:id/approval-request', tag: 'Job requests', summary: 'Ask approval for a draft', scope: 'job:create', status: 201,
    body: z.object({ reason: z.string().min(1).max(4000) }), response: { schema: 'JobRequest' },
  },
];
