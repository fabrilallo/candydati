import { CONSENT_SCOPES, httpUrlSchema, receivedSchema } from '@candydati/domain';
import { z } from 'zod';
import { consentAnswerBody } from './schemas-import.js';
import { submitFeedbackBody } from './schemas-hr.js';
import type { RouteSpec } from './spec.js';

export const publicRoutes: readonly RouteSpec[] = [
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
    method: 'get', path: '/api/v1/public/organizations/:orgSlug/careers-page', tag: 'Public', summary: 'The careers page of an organization', scope: null,
    description: 'The published page: visible sections only, and the media they use (URLs of the files). An organization that never published gets a default page.',
    response: { schema: 'PublicCareersPage' },
  },
  {
    method: 'get', path: '/api/v1/public/organizations/:orgSlug/careers-media/:mediaId/:fileName', tag: 'Public', summary: 'A file of the published careers page (image or video)', scope: null, fileMediaType: 'application/octet-stream',
    description: 'Only files a visible section of the published page uses (404 otherwise: drafts and the library are not public). The bytes, not the JSON envelope: WebP for images (several widths), MP4 or WebM for videos, with `Cache-Control: public, max-age=31536000, immutable` (the file name carries the content hash). Videos accept a single `Range: bytes=a-b` request (206, `Content-Range`; 416 when unsatisfiable). Served with `nosniff` and a sandboxing CSP.',
    response: { schema: z.string() },
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
  {
    method: 'post', path: '/api/v1/public/organizations/:orgSlug/jobs/:jobSlug/applications', tag: 'Public', summary: 'Apply to a published ad', scope: null, status: 201, multipart: true,
    description: 'What the careers page sends: the form fields and one `cv` file (PDF or DOCX, checked by content, not by name). `consentScopes` must include `selection` and `privacyNoticeVersion` must be the active one, or the request is refused with `422`. The answer is always `{ received: true }` and never says whether the person, the ad or the email already existed. Rate limited per IP, with daily caps per organization and per job. Not open to other origins.',
    body: z.object({
      firstName: z.string(), lastName: z.string(), email: z.email(), phone: z.string().optional(), linkedinUrl: httpUrlSchema.optional(), message: z.string().optional(),
      consentScopes: z.array(z.enum(CONSENT_SCOPES)).min(1).describe('Sent as repeated fields. Must include `selection`.'), privacyNoticeVersion: z.number().int().positive(),
      origin: z.string().max(500).optional().describe('Where the person came from (`utm_source`, `ref`); sanitized to a short label.'),
      campaign: z.string().max(500).optional().describe('`utm_campaign` of the ad URL; sanitized to a short label.'),
      website: z.string().max(0).optional().describe('Honeypot: leave empty.'),
      cv: z.string().describe('The CV file (binary).'),
    }),
    response: { schema: receivedSchema },
  },
  {
    method: 'post', path: '/api/v1/public/organizations/:orgSlug/jobs/:jobSlug/view', tag: 'Public', summary: 'Count a visit of a published ad', scope: null, status: 204, noContent: true,
    description: 'The beacon the careers page fires once a browser has shown an ad. Counts one visit in a daily aggregate by `source` (`utm_source`, `ref` or the referrer host) and `campaign` (`utm_campaign`): no cookie, no IP address and no user agent is stored, so visits cannot be told apart. Always `204`, whether the organization or the ad exists or not, so it reveals nothing; crawlers are not counted. Rate limited per IP (`429`). Not open to other origins.',
    query: z.object({
      source: z.string().max(500).optional().describe('Where the visit came from; sanitized to a short label, `direct` when absent.'),
      campaign: z.string().max(500).optional().describe('`utm_campaign` of the link; sanitized, none when absent.'),
    }),
    response: { schema: z.null() },
  },
  {
    method: 'get', path: '/api/v1/public/feedback/:token/cv', tag: 'Public', summary: 'CV of the candidate, for an interviewer', scope: null, fileMediaType: 'application/octet-stream',
    description: 'The personal link token is the only credential. A PDF is shown inline inside a CSP sandbox; any other type is a download. Never cached.', response: { schema: z.string() },
  },
];
