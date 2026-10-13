import {
  emailTemplateInputSchema,
  findUnknownVariables,
  isSingletonKind,
  renderTemplate,
  type EmailTemplate,
  type EmailTemplateKind,
} from '@tt/domain';
import { z } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import type { MessagingDeps } from '../../messaging-ports.js';
import { defineMessagingUseCase } from './define.js';
import {
  buildTemplateValues,
  DEFAULT_TEMPLATE_PREFIX,
  mergeTemplates,
  oneLine,
  requireApplicationInOrganization,
  requireOrganization,
  toTemplateView,
} from './shared.js';
import { requireJob } from '../jobs/shared.js';
import { requireCandidate } from '../candidates/shared.js';
import type { EmailTemplateView, MessagePreview } from './views.js';

/** Unknown variables are refused when saving, so a stored template always renders completely. */
export function assertKnownVariables(subject: string, body: string): void {
  const issues = [
    ...findUnknownVariables(subject).map((name) => ({ path: 'subject', message: `unknown_variable:${name}` })),
    ...findUnknownVariables(body).map((name) => ({ path: 'body', message: `unknown_variable:${name}` })),
  ];
  if (issues.length > 0) throw new ValidationError(issues);
}

export const listEmailTemplates = defineMessagingUseCase({
  name: 'listEmailTemplates',
  input: z.object({}),
  permission: 'email_template:manage',
  audit: { skip: 'read of organization templates, no personal data' },
  handler: async ({ deps, actor }): Promise<readonly EmailTemplateView[]> =>
    mergeTemplates(await deps.templates.list(actor.organizationId), deps.config.defaultLocale),
});

const saveInput = emailTemplateInputSchema.extend({
  /** A stored template id, or `default:<kind>` to edit a built-in default (it becomes the organization's own). */
  id: z.string().min(1).optional(),
});

async function resolveExisting(
  deps: MessagingDeps,
  organizationId: string,
  id: string | undefined,
  kind: EmailTemplateKind,
): Promise<EmailTemplate | null> {
  if (id === undefined) return null;
  if (id.startsWith(DEFAULT_TEMPLATE_PREFIX)) {
    if (id.slice(DEFAULT_TEMPLATE_PREFIX.length) !== kind || !isSingletonKind(kind)) {
      throw new ValidationError([{ path: 'kind', message: 'default_kind_mismatch' }]);
    }
    return deps.templates.findByKind(organizationId, kind);
  }
  const found = await deps.templates.findById(organizationId, id);
  if (!found) throw new NotFoundError('Template not found.');
  return found;
}

/** Creates a template or updates one; saving a default creates the organization's own version of it. */
export const saveEmailTemplate = defineMessagingUseCase({
  name: 'saveEmailTemplate',
  input: saveInput,
  permission: 'email_template:manage',
  audit: {
    action: 'email_template.saved',
    target: (_input, view: EmailTemplateView) => ({ type: 'email_template', id: view.id }),
    metadata: (_input, view) => ({ kind: view.kind }),
  },
  handler: async ({ deps, actor, input }): Promise<EmailTemplateView> => {
    assertKnownVariables(input.subject, input.body);
    const { organizationId } = actor;
    const existing = await resolveExisting(deps, organizationId, input.id, input.kind);
    if (isSingletonKind(input.kind)) {
      const holder = await deps.templates.findByKind(organizationId, input.kind);
      if (holder && holder.id !== existing?.id) throw new ConflictError('This kind of template already exists.');
    }
    const now = deps.now();
    const saved = await deps.templates.save({
      id: existing?.id ?? deps.newId(),
      organizationId,
      kind: input.kind,
      name: input.name,
      subject: input.subject,
      body: input.body,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return toTemplateView(saved);
  },
});

/** Deleting an edited default restores the built-in one. A built-in default itself cannot be deleted. */
export const deleteEmailTemplate = defineMessagingUseCase({
  name: 'deleteEmailTemplate',
  input: z.object({ id: z.string().min(1) }),
  permission: 'email_template:manage',
  audit: {
    action: 'email_template.deleted',
    target: (_input, template: EmailTemplate) => ({ type: 'email_template', id: template.id }),
    metadata: (_input, template) => ({ kind: template.kind }),
  },
  handler: async ({ deps, actor, input }): Promise<EmailTemplate> => {
    const template = input.id.startsWith(DEFAULT_TEMPLATE_PREFIX)
      ? await resolveDefaultOverride(deps, actor.organizationId, input.id)
      : await deps.templates.findById(actor.organizationId, input.id);
    if (!template || !(await deps.templates.delete(actor.organizationId, template.id))) throw new NotFoundError('Template not found.');
    return template;
  },
});

async function resolveDefaultOverride(deps: MessagingDeps, organizationId: string, id: string): Promise<EmailTemplate | null> {
  const kind = id.slice(DEFAULT_TEMPLATE_PREFIX.length);
  return kind !== 'custom' && isSingletonKind(kind as EmailTemplateKind) ? deps.templates.findByKind(organizationId, kind as EmailTemplateKind) : null;
}

/** Renders subject and body for one application, so the sender sees what the candidate will read. */
export const previewMessage = defineMessagingUseCase({
  name: 'previewMessage',
  input: z.object({
    subject: z.string().max(1000),
    body: z.string().max(100_000),
    applicationId: z.string().min(1),
  }),
  permission: 'message:send',
  audit: { skip: 'preview only: nothing is stored or sent' },
  handler: async ({ deps, actor, input }): Promise<MessagePreview> => {
    const application = await requireApplicationInOrganization(deps, actor.organizationId, input.applicationId);
    const [organization, candidate, job] = await Promise.all([
      requireOrganization(deps, actor.organizationId),
      requireCandidate(deps, actor.organizationId, application.candidateId),
      requireJob(deps, actor.organizationId, application.jobId),
    ]);
    const values = buildTemplateValues({ config: deps.config, organization, job, candidate, stageId: application.stageId });
    const subject = renderTemplate(input.subject, values);
    const body = renderTemplate(input.body, values);
    return {
      subject: oneLine(subject.text),
      body: body.text,
      unknownVariables: [...new Set([...subject.unknownVariables, ...body.unknownVariables])],
    };
  },
});
