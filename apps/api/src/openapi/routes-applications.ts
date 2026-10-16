import { BULK_MESSAGE_MAX, CONSENT_SCOPES, OUTCOMES, decidedSchema, erasedSchema, sendResultSchema } from '@candydati/domain';
import { z } from 'zod';
import { confirmNameBody } from './schemas-admin.js';
import { candidateDetailSchema } from './schemas-work.js';
import type { RouteSpec } from './spec.js';

const outcome = z.enum(OUTCOMES).describe('`hired`, `not_selected` or `withdrawn`. Closes the application for good.');
const applicationIds = z.array(z.string().min(1)).min(1).max(BULK_MESSAGE_MAX);

/** Actions on one application: moving, deciding, messaging, the CV and the candidate's rights. */
export const applicationRoutes: readonly RouteSpec[] = [
  {
    method: 'post', path: '/api/v1/applications/:id/move', tag: 'Pipeline', summary: 'Move an application to another stage', scope: 'candidate:move',
    description: 'Stage ids come from the pipeline of the job. Moving into a stage runs its automations and asks the interviewers of that stage for feedback. A closed application cannot be moved (`409`).',
    body: z.object({ stageId: z.string().min(1) }), response: { schema: 'ApplicationCard' },
  },
  {
    method: 'post', path: '/api/v1/applications/:id/decide', tag: 'Pipeline', summary: 'Decide the outcome of an application', scope: 'candidate:decide', sessionOnly: true,
    description: 'Every application ends with an outcome. A decision is a person\'s: never allowed to an API key or the assistant.',
    body: z.object({ outcome }), response: { schema: 'ApplicationCard' },
  },
  {
    method: 'post', path: '/api/v1/applications/decide', tag: 'Pipeline', summary: 'Decide many applications at once', scope: 'candidate:decide', sessionOnly: true,
    description: 'All or none: one decided or foreign id refuses the whole batch with `409`/`404`. One audit event per application.',
    body: z.object({ applicationIds, outcome }), response: { schema: decidedSchema },
  },
  {
    method: 'get', path: '/api/v1/applications/:id/timeline', tag: 'Candidates', summary: 'Timeline of an application', scope: 'candidate:read',
    description: 'What happened to one application, oldest first: received (with source and campaign), stage moves, notes, messages, feedback submitted, reconfirmation and the outcome. Messages appear with `message:read` and feedback with `feedback:read`; feedback shows only that it was submitted, never answers or a recommendation. Entries rebuilt by a migration carry `fromPreviousSystem: true`. Same access by ad as the profile: an application outside your jobs is `404`. Query `viaJobId` is the job of the pipeline you came from (needed for imported people still to reconfirm).',
    query: z.object({ viaJobId: z.string().min(1).optional() }), response: { schema: 'ApplicationTimeline' },
  },
  { method: 'get', path: '/api/v1/applications/:id/messages', tag: 'Messages', summary: 'Conversation with a candidate', scope: 'message:read', response: { schema: 'Message', list: true } },
  {
    method: 'post', path: '/api/v1/messages', tag: 'Messages', summary: 'Send an email to one or more candidates', scope: 'message:send', sessionOnly: true,
    description: 'One message per application, queued and sent by the worker. Always a person\'s decision: never allowed to an API key or the assistant. Variables in `subject` and `body` are checked before anything is stored.',
    body: z.object({ applicationIds, templateId: z.string().min(1).optional(), subject: z.string().min(1).max(200), body: z.string().min(1).max(10_000) }),
    response: { schema: sendResultSchema },
  },
  {
    method: 'get', path: '/api/v1/applications/:id/cv', tag: 'Candidates', summary: 'Download the original CV', scope: 'candidate:read', fileMediaType: 'application/octet-stream',
    description: 'The file as uploaded. Personal data: every read is recorded in the audit log. Query `disposition=inline` shows a PDF in the browser (inside a CSP sandbox); anything else is a download. Never cached.',
    query: z.object({ disposition: z.enum(['inline', 'attachment']).optional() }), response: { schema: z.string() },
  },
  {
    method: 'post', path: '/api/v1/applications/:id/withdraw-consent', tag: 'Privacy', summary: 'Record a withdrawal of consent', scope: 'candidate:update',
    description: 'For one scope (`selection` or `talent_pool`). Withdrawing `selection` erases the application (`{ erased: true }`); otherwise the updated candidate profile is returned.',
    body: z.object({ scope: z.enum(CONSENT_SCOPES) }), response: { schema: z.union([erasedSchema, candidateDetailSchema]) },
  },
  {
    method: 'post', path: '/api/v1/applications/:id/erase', tag: 'Privacy', summary: 'Erase one application', scope: 'candidate:erase', sessionOnly: true,
    description: 'Irreversible: removes the application, its CV and the data that exist only for it. Erasure is never allowed to an API key or the assistant.',
    body: confirmNameBody, response: { schema: erasedSchema },
  },
];
