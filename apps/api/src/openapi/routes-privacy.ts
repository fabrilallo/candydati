import { SUPPORTED_LOCALES, erasedSchema, privacyNoticeInputSchema, processingRecordSchema, retentionOverviewSchema, dataExportCreatedSchema, privacyTemplateSchema, httpUrlSchema } from '@tt/domain';
import { z } from 'zod';
import { confirmNameBody } from './schemas-admin.js';
import type { RouteSpec } from './spec.js';

/** Privacy notice, retention, the organization export and the rights of one candidate. All reserved to people (`privacy:manage`, `data:export`, `candidate:erase`). */
export const privacyRoutes: readonly RouteSpec[] = [
  {
    method: 'get', path: '/api/v1/privacy-notice', tag: 'Privacy', summary: 'The active privacy notice', scope: null, authenticated: true,
    description: 'The latest version, or `null` before the first one is published. Any member or key may read it: it is public text.', response: { schema: 'PrivacyNotice' },
  },
  { method: 'get', path: '/api/v1/privacy-notice/versions', tag: 'Privacy', summary: 'Every version of the privacy notice', scope: 'privacy:manage', sessionOnly: true, response: { schema: 'PrivacyNotice', list: true } },
  {
    method: 'get', path: '/api/v1/privacy-notice/template', tag: 'Privacy', summary: 'A starting text for the privacy notice', scope: 'privacy:manage', sessionOnly: true,
    query: z.object({ language: z.enum(SUPPORTED_LOCALES), contactEmail: z.email().optional() }), response: { schema: privacyTemplateSchema },
  },
  {
    method: 'post', path: '/api/v1/privacy-notice', tag: 'Privacy', summary: 'Publish a new version of the privacy notice', scope: 'privacy:manage', sessionOnly: true, status: 201,
    description: 'Every save creates a new immutable version; old versions stay readable. Jobs can be published only with an active notice.',
    body: privacyNoticeInputSchema, response: { schema: 'PrivacyNotice' },
  },
  {
    method: 'get', path: '/api/v1/privacy/retention', tag: 'Privacy', summary: 'Upcoming erasures and past retention runs', scope: 'privacy:manage', sessionOnly: true,
    response: { schema: retentionOverviewSchema },
  },
  {
    method: 'get', path: '/api/v1/privacy/processing-record', tag: 'Privacy', summary: 'Record of processing', scope: 'privacy:manage', sessionOnly: true,
    response: { schema: processingRecordSchema },
  },
  {
    method: 'get', path: '/api/v1/candidates/:id/export', tag: 'Privacy', summary: 'Export everything held about a candidate', scope: 'candidate:export', fileMediaType: 'application/zip',
    description: 'A ZIP with the profile, applications, notes, messages and CVs (right of access). Recorded in the audit log.', response: { schema: z.string() },
  },
  {
    method: 'patch', path: '/api/v1/candidates/:id/details', tag: 'Privacy', summary: 'Correct the personal data of a candidate', scope: 'candidate:update',
    description: 'Right to rectification: only the fields sent change (`firstName`, `lastName`, `email`, `phone`, `linkedinUrl`).',
    body: z.object({
      firstName: z.string().optional(), lastName: z.string().optional(), email: z.email().optional(), phone: z.string().optional(), linkedinUrl: httpUrlSchema.optional(),
    }), response: { schema: 'CandidateDetail' },
  },
  {
    method: 'post', path: '/api/v1/candidates/:id/erase', tag: 'Privacy', summary: 'Erase a candidate', scope: 'candidate:erase', sessionOnly: true,
    description: 'Irreversible: removes the profile, every application, note, message and CV. Never allowed to an API key or the assistant.',
    body: confirmNameBody, response: { schema: erasedSchema },
  },
  {
    method: 'post', path: '/api/v1/exports', tag: 'Exports', summary: 'Request an export of the whole organization', scope: 'data:export', sessionOnly: true, status: 202,
    description: 'Built in the background by the worker; poll `GET /exports` until `ready`.', response: { schema: dataExportCreatedSchema },
  },
  { method: 'get', path: '/api/v1/exports', tag: 'Exports', summary: 'List the organization exports', scope: 'data:export', sessionOnly: true, response: { schema: 'DataExport', list: true } },
  {
    method: 'get', path: '/api/v1/exports/:id/download', tag: 'Exports', summary: 'Download a ready export', scope: 'data:export', sessionOnly: true, fileMediaType: 'application/zip',
    description: 'A ZIP. `404` once it has expired.', response: { schema: z.string() },
  },
];
