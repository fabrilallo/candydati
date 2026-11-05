import {
  WEBHOOK_EVENT_TYPES,
  PERMISSIONS,
  automationMatchSchema,
  automationPreviewSchema,
  automationRunSchema,
  automationRuleInputSchema,
  copyAutomationsInputSchema,
  copyAutomationsResultSchema,
  distributionOverviewSchema,
  emailSettingsInputSchema,
  emailTemplateInputSchema,
  jobDistributionSchema,
  savedTrackedLinkSchema,
  trackedLinkInputSchema,
  trackedLinksSchema,
  setChannelEnabledInputSchema,
  templatePreviewSchema,
  unreadCountSchema,
  apiKeyCreatedSchema,
  webhookCreatedSchema,
  AUDIT_ACTIONS,
  addSkillAliasInputSchema,
  builtInSkillAliasInputSchema,
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
    description:
      'When `trigger` fires for an application of `stageId` and every condition holds, send a template or create a task. Triggers: `stage_entered` (default), `stage_stuck` (in the stage for `days`), `candidate_replied`, `feedback_submitted` (for the stage the feedback was asked for), `response_due_soon` (`daysBefore` the response deadline of the job). Time-based triggers are checked hourly. Each fires once per occurrence. Conditions (optional, all must hold): application `sources`, candidate `tags` (all of them), consent `consentScopes` (given through the form). Rules never move, decide, score or rank.',
    body: automationRuleInputSchema, response: { schema: 'AutomationRule' },
  },
  {
    method: 'post', path: '/api/v1/jobs/:id/automations/preview', tag: 'Automations', summary: 'Who a rule would act for now', scope: 'automation:manage',
    description:
      'Read-only, no side effects: the open applications of `stageId` that meet the conditions and, for a time-based trigger, those it would fire for at the next scan (with `ruleId`, leaving out what that rule already did). Names, at most 50, by date of application, only with `candidate:read`; otherwise `items` is null and only the counts are given.',
    body: automationMatchSchema.extend({ ruleId: z.string().min(1).optional().describe('The rule being edited, if it is saved already.') }),
    response: { schema: automationPreviewSchema },
  },
  {
    method: 'get', path: '/api/v1/automations/:id/runs', tag: 'Automations', summary: 'Recent runs of a rule', scope: 'automation:manage',
    description:
      'Read-only log of what the rule did, newest first: when, the kind of trigger occurrence (`stage_entered`, `stage_stuck`, `response_due_soon`, `candidate_replied`, `feedback_submitted`) and the application. `limit` defaults to 20, at most 50. `candidate` (name) only with `candidate:read`, otherwise null. Never a score or a ranking.',
    query: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    response: { schema: automationRunSchema, list: true },
  },
  { method: 'put', path: '/api/v1/automations/:id', tag: 'Automations', summary: 'Replace a rule', scope: 'automation:manage', body: automationRuleInputSchema, response: { schema: 'AutomationRule' } },
  { method: 'delete', path: '/api/v1/automations/:id', tag: 'Automations', summary: 'Delete a rule', scope: 'automation:manage', response: { schema: deletedResult } },
  {
    method: 'post', path: '/api/v1/automations/copy', tag: 'Automations', summary: 'Copy rules to a stage of a job or a job template', scope: 'automation:manage', status: 201,
    description:
      'Copies some rules (`from.ruleIds`) or every rule of a stage (`from.stageId`) of a job (`from.jobId`) or job template (`from.templateId`) to one stage of a job or template (`to`). Every copy is validated against the target first (the stage exists, templates resolve in its language, the people named are members, a proposed move points at one of its stages): all or nothing. The copies are the caller’s own rules (`createdBy`). Templates need `job_template:read` to copy from and `job_template:create` to copy to.',
    body: copyAutomationsInputSchema, response: { schema: copyAutomationsResultSchema },
  },
  {
    method: 'get', path: '/api/v1/job-templates/:id/automations', tag: 'Automations', summary: 'Rules kept with a job template', scope: 'automation:manage',
    description: 'A job created from the template gets a copy of each one whose stage it has, made by whoever creates the job (only if they may manage automations).',
    response: { schema: 'TemplateAutomationRule', list: true },
  },
  { method: 'delete', path: '/api/v1/job-template-automations/:id', tag: 'Automations', summary: 'Delete a rule of a job template', scope: 'automation:manage', response: { schema: deletedResult } },
  { method: 'get', path: '/api/v1/jobs/:id/distribution', tag: 'Distribution', summary: 'Where a job is published', scope: 'job:read', response: { schema: jobDistributionSchema } },
  {
    method: 'post', path: '/api/v1/jobs/:id/distribution/sync', tag: 'Distribution', summary: 'Push a job to the enabled channels now', scope: 'job:publish',
    response: { schema: jobDistributionSchema },
  },
  {
    method: 'get', path: '/api/v1/jobs/:id/tracked-links', tag: 'Distribution', summary: 'Tracked links saved on a job', scope: 'job:publish',
    description: 'One per channel (`utm_source`) and campaign (`utm_campaign`), oldest first. The URL is the public address of the ad with those two parameters.',
    response: { schema: trackedLinksSchema },
  },
  {
    method: 'post', path: '/api/v1/jobs/:id/tracked-links', tag: 'Distribution', summary: 'Save a tracked link for a channel and campaign', scope: 'job:publish', status: 201,
    description: 'Both are sanitized the way the reports name them. A pair the job already has answers 200 with that link and `created: false`.',
    body: trackedLinkInputSchema, response: { schema: savedTrackedLinkSchema },
  },
  {
    method: 'delete', path: '/api/v1/jobs/:id/tracked-links/:linkId', tag: 'Distribution', summary: 'Remove a tracked link', scope: 'job:publish',
    description: 'Applications that arrived through it keep their source: the reports do not change.', response: { schema: z.object({ removed: z.literal(true) }) },
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
  {
    method: 'get', path: '/api/v1/skill-aliases', tag: 'Skill aliases', summary: 'The built-in skill aliases and the organization’s own', scope: 'skill_alias:manage', sessionOnly: true,
    description: 'Every built-in skill with its aliases and whether each is on for the organization (`builtIn`), the aliases the organization added (`own`) and the most it may add (`limit`).',
    response: { schema: 'SkillAliasOverview' },
  },
  {
    method: 'post', path: '/api/v1/skill-aliases', tag: 'Skill aliases', summary: 'Add an alias to a skill', scope: 'skill_alias:manage', sessionOnly: true, status: 201,
    description: '`alias` becomes another way of writing `skill` in the filter on declared criteria. `skill` is a built-in skill (under any of its names) or a new skill of the organization. An alias belongs to one skill, ignoring case, punctuation and diacritics: `409 alias_taken` when another skill has it, `409 alias_redundant` when this skill has it already, `409 alias_limit` at the cap.',
    body: addSkillAliasInputSchema, response: { schema: 'SkillAlias' },
  },
  { method: 'delete', path: '/api/v1/skill-aliases/:id', tag: 'Skill aliases', summary: 'Remove an alias the organization added', scope: 'skill_alias:manage', sessionOnly: true, response: { schema: deletedResult } },
  {
    method: 'post', path: '/api/v1/skill-aliases/built-in/disable', tag: 'Skill aliases', summary: 'Switch a built-in alias off', scope: 'skill_alias:manage', sessionOnly: true,
    description: 'The filter no longer treats this built-in alias as the same skill, for this organization only. Repeating it changes nothing.',
    body: builtInSkillAliasInputSchema, response: { schema: z.object({ alias: z.string(), enabled: z.literal(false) }) },
  },
  {
    method: 'post', path: '/api/v1/skill-aliases/built-in/enable', tag: 'Skill aliases', summary: 'Switch a built-in alias on again', scope: 'skill_alias:manage', sessionOnly: true,
    body: builtInSkillAliasInputSchema, response: { schema: z.object({ alias: z.string(), enabled: z.literal(true) }) },
  },
];
