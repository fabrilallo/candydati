import { ATTENTION_STATES, NOTE_MAX, TAG_MAX, TAGS_PER_CANDIDATE_MAX, taskInputSchema } from '@tt/domain';
import { z } from 'zod';
import { page, type RouteSpec } from './spec.js';

export const candidateRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/jobs/:id/pipeline', tag: 'Pipeline', summary: 'Pipeline of a job', scope: 'candidate:read',
    description: 'Stages generated from the declared process, with counts and one card per application. Read only: moving needs `candidate:move` (see `POST /applications/{id}/move`), and a key can never decide.',
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

