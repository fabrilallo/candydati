import {
  WEBHOOK_EVENT_TYPES,
  PERMISSIONS,
  automationRuleInputSchema,
  distributionOverviewSchema,
  emailSettingsInputSchema,
  emailTemplateInputSchema,
  jobDistributionSchema,
  setChannelEnabledInputSchema,
  templatePreviewSchema,
  unreadCountSchema,
  apiKeyCreatedSchema,
  webhookCreatedSchema,
  AUDIT_ACTIONS,
} from '@candydati/domain';
import { z } from 'zod';
import { deletedResult } from './schemas-admin.js';
import { idResult, page, type RouteSpec } from './spec.js';

const webhookBody = z.object({ url: z.url().describe('HTTPS only; private addresses are refused.'), events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1), enabled: z.boolean().optional() });
const templateBody = emailTemplateInputSchema.extend({ id: z.string().min(1).optional().describe('Only on `POST`: a stored id, or `default:<kind>` to customise a built-in default.') });

/** Automations, distribution channels, email settings and templates. */
export const configRoutes: readonly RouteSpec[] = [
  { method: 'get', path: '/api/v1/jobs/:id/automations', tag: 'Automations', summary: 'Rules of a job', scope: 'automation:manage', response: { schema: 'AutomationRule', list: true } },
  {
    method: 'post', path: '/api/v1/jobs/:id/automations', tag: 'Automations', summary: 'Add a rule to a job', scope: 'automation:manage', status: 201,
    description: 'When an application enters `stageId`, send a template or create a task. Rules never move or decide.', body: automationRuleInputSchema, response: { schema: 'AutomationRule' },
  },
  { method: 'put', path: '/api/v1/automations/:id', tag: 'Automations', summary: 'Replace a rule', scope: 'automation:manage', body: automationRuleInputSchema, response: { schema: 'AutomationRule' } },
  { method: 'delete', path: '/api/v1/automations/:id', tag: 'Automations', summary: 'Delete a rule', scope: 'automation:manage', response: { schema: deletedResult } },
  { method: 'get', path: '/api/v1/jobs/:id/distribution', tag: 'Distribution', summary: 'Where a job is published', scope: 'job:read', response: { schema: jobDistributionSchema } },
  {
    method: 'post', path: '/api/v1/jobs/:id/distribution/sync', tag: 'Distribution', summary: 'Push a job to the enabled channels now', scope: 'job:publish',
    response: { schema: jobDistributionSchema },
  },
  { method: 'get', path: '/api/v1/distribution', tag: 'Distribution', summary: 'Feed URLs and channels of the organization', scope: 'job:read', response: { schema: distributionOverviewSchema } },
  {
    method: 'put', path: '/api/v1/distribution/channels/:channelId', tag: 'Distribution', summary: 'Turn a channel on or off', scope: 'organization:update',
    body: setChannelEnabledInputSchema, response: { schema: 'DistributionChannel' },
  },
  { method: 'get', path: '/api/v1/email-templates', tag: 'Email', summary: 'List email templates', scope: 'email_template:manage', description: 'The organization\'s own templates plus the built-in defaults.', response: { schema: 'EmailTemplate', list: true } },
  { method: 'post', path: '/api/v1/email-templates', tag: 'Email', summary: 'Create or customise an email template', scope: 'email_template:manage', status: 201, body: templateBody, response: { schema: 'EmailTemplate' } },
  { method: 'put', path: '/api/v1/email-templates/:id', tag: 'Email', summary: 'Replace an email template', scope: 'email_template:manage', body: emailTemplateInputSchema, response: { schema: 'EmailTemplate' } },
  { method: 'delete', path: '/api/v1/email-templates/:id', tag: 'Email', summary: 'Delete an email template', scope: 'email_template:manage', response: { schema: idResult } },
  {
    method: 'post', path: '/api/v1/email-templates/preview', tag: 'Email', summary: 'Render a template for one application', scope: 'message:send', sessionOnly: true,
    description: 'Fills the variables with the data of the application and lists the unknown ones. Sends nothing.',
    body: z.object({ subject: z.string().max(1000), body: z.string().max(100_000), applicationId: z.string().min(1) }), response: { schema: templatePreviewSchema },
  },
  { method: 'get', path: '/api/v1/email-settings', tag: 'Email', summary: 'Sender name and own domain', scope: 'message:read', response: { schema: 'EmailSettings' } },
  {
    method: 'put', path: '/api/v1/email-settings', tag: 'Email', summary: 'Change the sender name and address', scope: 'email_settings:manage', sessionOnly: true,
    body: emailSettingsInputSchema, response: { schema: 'EmailSettings' },
  },
  {
    method: 'post', path: '/api/v1/email-settings/verify', tag: 'Email', summary: 'Check the DNS records of the sender domain', scope: 'email_settings:manage', sessionOnly: true,
    response: { schema: 'EmailSettings' },
  },
  {
    method: 'get', path: '/api/v1/audit-log', tag: 'Audit', summary: 'The audit log', scope: 'audit:read',
    description: 'Append-only record of who did what, newest first. Includes reads of personal data.',
    query: z.object({ action: z.enum(AUDIT_ACTIONS).optional(), ...page }), response: { schema: 'AuditEvent', list: true, paginated: true },
  },
  {
    method: 'get', path: '/api/v1/notifications', tag: 'Notifications', summary: 'My notifications', scope: null, sessionOnly: true,
    description: 'Each person sees only their own: an API key has no inbox.',
    query: z.object({ unread: z.boolean().optional(), ...page }), response: { schema: 'Notification', list: true, paginated: true },
  },
  {
    method: 'post', path: '/api/v1/notifications/read', tag: 'Notifications', summary: 'Mark notifications as read', scope: null, sessionOnly: true,
    description: 'Send `ids`, or `all: true`, not both.',
    body: z.object({ ids: z.array(z.string().min(1)).min(1).max(200).optional(), all: z.literal(true).optional() }), response: { schema: z.object({ updated: z.number().int() }) },
  },
  { method: 'get', path: '/api/v1/notifications/unread-count', tag: 'Notifications', summary: 'How many notifications are unread', scope: null, sessionOnly: true, response: { schema: unreadCountSchema } },
  {
    method: 'get', path: '/api/v1/api-keys', tag: 'API keys', summary: 'List API keys', scope: 'api_key:manage', sessionOnly: true,
    description: 'Never includes the secret. A key cannot manage keys: session only.', response: { schema: 'ApiKey', list: true },
  },
  {
    method: 'post', path: '/api/v1/api-keys', tag: 'API keys', summary: 'Create an API key', scope: 'api_key:manage', sessionOnly: true, status: 201,
    description: 'The only response that carries the secret (`candydati_...`): it cannot be read again. A key never has more than its creator.',
    body: z.object({ name: z.string().min(1).max(80), scopes: z.array(z.enum(PERMISSIONS)).min(1), expiresAt: z.iso.datetime().optional() }), response: { schema: apiKeyCreatedSchema },
  },
  { method: 'post', path: '/api/v1/api-keys/:id/revoke', tag: 'API keys', summary: 'Revoke an API key', scope: 'api_key:manage', sessionOnly: true, response: { schema: 'ApiKey' } },
  { method: 'delete', path: '/api/v1/api-keys/:id', tag: 'API keys', summary: 'Revoke an API key (alias)', scope: 'api_key:manage', sessionOnly: true, response: { schema: 'ApiKey' } },
  { method: 'get', path: '/api/v1/webhooks', tag: 'Webhooks', summary: 'List webhook endpoints', scope: 'webhook:manage', sessionOnly: true, response: { schema: 'WebhookEndpoint', list: true } },
  {
    method: 'post', path: '/api/v1/webhooks', tag: 'Webhooks', summary: 'Create a webhook endpoint', scope: 'webhook:manage', sessionOnly: true, status: 201,
    description: 'The signing secret (`whsec_...`) is returned once.', body: webhookBody, response: { schema: webhookCreatedSchema },
  },
  { method: 'put', path: '/api/v1/webhooks/:id', tag: 'Webhooks', summary: 'Replace a webhook endpoint', scope: 'webhook:manage', sessionOnly: true, body: webhookBody, response: { schema: 'WebhookEndpoint' } },
  { method: 'delete', path: '/api/v1/webhooks/:id', tag: 'Webhooks', summary: 'Delete a webhook endpoint', scope: 'webhook:manage', sessionOnly: true, response: { schema: deletedResult } },
  {
    method: 'post', path: '/api/v1/webhooks/:id/test', tag: 'Webhooks', summary: 'Send a test event', scope: 'webhook:manage', sessionOnly: true,
    response: { schema: z.object({ eventId: z.string() }) },
  },
  { method: 'get', path: '/api/v1/webhooks/:id/deliveries', tag: 'Webhooks', summary: 'Recent deliveries of an endpoint', scope: 'webhook:manage', sessionOnly: true, response: { schema: 'WebhookDelivery', list: true } },
];
