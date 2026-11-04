import { agencySettingInputSchema, clientInputSchema, jobClientInputSchema, shortlistAnswerSchema, shortlistInputSchema } from '@candydati/domain';
import { z } from 'zod';
import type { RouteSpec } from './spec.js';

const NO_SEND =
  'Sending candidate data outside the organization is a decision of a person: `shortlist:send` is never granted to an API key or to the assistant.';

/** Clients of an agency, the client of a job and shortlists presented to clients (PRODUCT.md §3.5). */
export const clientRoutes: readonly RouteSpec[] = [
  { method: 'get', path: '/api/v1/settings/agency', tag: 'Clients', summary: 'Does the organization recruit for clients', scope: 'client:read', response: { schema: 'AgencySetting' } },
  {
    method: 'put', path: '/api/v1/settings/agency', tag: 'Clients', summary: 'Turn recruiting for clients on or off', scope: 'organization:update', sessionOnly: true,
    description: 'Owners and admins. `agencyAuthorization` is the reference of the authorization to recruit for others (D.Lgs. 276/2003, art. 9), shown on every client ad.',
    body: agencySettingInputSchema, response: { schema: 'AgencySetting' },
  },
  {
    method: 'get', path: '/api/v1/clients', tag: 'Clients', summary: 'List clients', scope: 'client:read',
    description: 'Contacts (names and emails) only for people who manage clients or send shortlists; everyone else, API keys included, gets `contactCount`.',
    query: z.object({ includeArchived: z.boolean().optional() }), response: { schema: 'Client', list: true },
  },
  {
    method: 'post', path: '/api/v1/clients', tag: 'Clients', summary: 'Create a client', scope: 'client:manage', sessionOnly: true, status: 201,
    description: 'Only while the organization recruits for clients (`409 clients_off` otherwise). Names are unique in the organization, ignoring case.',
    body: clientInputSchema, response: { schema: 'Client' },
  },
  { method: 'get', path: '/api/v1/clients/:id', tag: 'Clients', summary: 'Read a client', scope: 'client:read', response: { schema: 'Client' } },
  {
    method: 'put', path: '/api/v1/clients/:id', tag: 'Clients', summary: 'Update a client', scope: 'client:manage', sessionOnly: true,
    description: 'Replaces name, website, logo and contacts. A contact keeps its id when sent with it; shortlists already sent keep the contact they went to.',
    body: clientInputSchema, response: { schema: 'Client' },
  },
  {
    method: 'put', path: '/api/v1/clients/:id/archived', tag: 'Clients', summary: 'Archive or restore a client', scope: 'client:manage', sessionOnly: true,
    description: 'An archived client keeps its jobs and history and gets no new job. Clients are never deleted.',
    body: z.object({ archived: z.boolean() }), response: { schema: 'Client' },
  },
  { method: 'get', path: '/api/v1/jobs/:id/client', tag: 'Clients', summary: 'Client of a job', scope: 'job:read', response: { schema: 'JobClient' } },
  {
    method: 'put', path: '/api/v1/jobs/:id/client', tag: 'Clients', summary: 'Set the client of a job', scope: 'client:manage', sessionOnly: true,
    description: '`display: named` shows the client on the ad as the employer; `confidential` says the ad is for a client of the agency and never names it. `clientId: null` removes the client.',
    body: jobClientInputSchema, response: { schema: 'JobClient' },
  },
  {
    method: 'get', path: '/api/v1/jobs/:id/shortlists', tag: 'Clients', summary: 'Shortlists of a job and the client answers', scope: 'shortlist:read',
    description: 'Never the link nor its hash. An answer is an opinion of the client: it never moves or decides an application.',
    response: { schema: 'Shortlist', list: true },
  },
  {
    method: 'post', path: '/api/v1/jobs/:id/shortlists', tag: 'Clients', summary: 'Send a shortlist to a client contact', scope: 'shortlist:send', sessionOnly: true, status: 201,
    description: `Open applications of the job only, with consent given. Per candidate: \`shareCv\` and the \`noteIds\` to show. The contact gets a personal link valid ${14} days (reminders after 3 and 7), and every candidate is emailed that their profile was presented to the client (or to "a client of the agency" when confidential). ${NO_SEND}`,
    body: shortlistInputSchema.omit({ jobId: true }), response: { schema: 'Shortlist' },
  },
  {
    method: 'post', path: '/api/v1/shortlists/:id/revoke', tag: 'Clients', summary: 'Revoke a shortlist link', scope: 'shortlist:send', sessionOnly: true,
    description: `The link stops working at once; answers already given stay. ${NO_SEND}`, response: { schema: 'Shortlist' },
  },
  {
    method: 'get', path: '/api/v1/public/shortlists/:token', tag: 'Public', summary: 'Shortlist page of a client', scope: null,
    description: 'For the client contact. The personal link token is the only credential. Shows per candidate only what the recruiter chose: name, the shared notes, whether a CV is there, the answer. Unknown, expired or revoked: 404. Never cached, never indexed, not open to other origins.',
    response: { schema: 'PublicShortlist' },
  },
  {
    method: 'post', path: '/api/v1/public/shortlists/:token/answers', tag: 'Public', summary: 'Answer for one candidate', scope: null,
    description: '`meet` or `not_for_us` with a short reason, once per candidate (`409` after). Recorded on the application; nothing moves it automatically.',
    body: shortlistAnswerSchema, response: { schema: 'PublicShortlistCandidate' },
  },
  {
    method: 'get', path: '/api/v1/public/shortlists/:token/candidates/:itemId/cv', tag: 'Public', summary: 'CV of a presented candidate', scope: null, fileMediaType: 'application/octet-stream',
    description: 'Only when the recruiter shared it. A PDF is shown inline inside a CSP sandbox; any other type is a download. Never cached.', response: { schema: z.string() },
  },
];
