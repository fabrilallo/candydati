import {
  isSingletonKind,
  SINGLETON_TEMPLATE_KINDS,
  defaultEmailTemplate,
  type Application,
  type Candidate,
  type EmailSettings,
  type EmailTemplate,
  type EmailTemplateKind,
  type Job,
  type Locale,
  type TemplateValues,
  stageDisplayName,
} from '@candydati/domain';
import { pipelineStagesOf, RECEIVED_STAGE_ID } from '@candydati/domain';
import { NotFoundError } from '../../errors.js';
import type { Conversation, MessagingConfig, MessagingDeps } from '../../messaging-ports.js';
import type { EmailTemplateView } from './views.js';

export const DEFAULT_TEMPLATE_PREFIX = 'default:';

const RECEIVED_LABEL: Readonly<Record<Locale, string>> = { it: 'Candidatura ricevuta', en: 'Application received' };

/** What the candidate reads as the stage name: the declared title, else the type, in the language of the ad. */
export function stageName(job: Job, stageId: string): string {
  if (stageId === RECEIVED_STAGE_ID) return RECEIVED_LABEL[job.content.language];
  const stage = pipelineStagesOf(job.content.process).find((candidate) => candidate.id === stageId)?.declared;
  return stage ? stageDisplayName(stage, job.content.language) : '';
}

export interface TemplateContext {
  readonly config: Pick<MessagingConfig, 'platformUrl'>;
  readonly organization: { readonly name: string; readonly slug: string };
  readonly job: Job;
  readonly candidate: Pick<Candidate, 'firstName' | 'lastName'>;
  readonly stageId: string;
}

export const buildTemplateValues = ({ config, organization, job, candidate, stageId }: TemplateContext): TemplateValues => ({
  'candidate.firstName': candidate.firstName,
  'candidate.lastName': candidate.lastName,
  'job.title': job.content.title,
  'organization.name': organization.name,
  'stage.name': stageName(job, stageId),
  'job.responseDays': job.content.responseDays === undefined ? '' : String(job.content.responseDays),
  'job.url': `${config.platformUrl}/careers/${organization.slug}/${job.slug}`,
});

/** A header must stay on one line. */
export const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

export async function requireOrganization(deps: Pick<MessagingDeps, 'organizations'>, organizationId: string) {
  const organization = await deps.organizations.findById(organizationId);
  if (!organization) throw new NotFoundError('Organization not found.');
  return organization;
}

export const ensureConversation = (
  deps: Pick<MessagingDeps, 'conversations' | 'newToken'>,
  organizationId: string,
  applicationId: string,
): Promise<Conversation> => deps.conversations.ensure({ applicationId, organizationId, token: deps.newToken() });

export const replyToAddress = (config: Pick<MessagingConfig, 'emailInboundDomain'>, conversation: Conversation): string =>
  `reply+${conversation.token}@${config.emailInboundDomain}`;

export interface SenderIdentity {
  readonly name: string;
  readonly address: string;
}

/** Only a verified own domain is used as From; everything else falls back to the instance identity. */
export function senderIdentity(
  config: Pick<MessagingConfig, 'platformName' | 'emailFromLocal' | 'emailDomain'>,
  organization: { readonly name: string },
  settings: EmailSettings | null,
): SenderIdentity {
  if (settings?.fromAddress && settings.domainStatus === 'verified') {
    return { name: settings.senderName, address: settings.fromAddress };
  }
  return {
    name: `${settings?.senderName ?? organization.name} via ${config.platformName}`,
    address: `${config.emailFromLocal}@${config.emailDomain}`,
  };
}

export const formatFrom = ({ name, address }: SenderIdentity): string => `"${name.replace(/["\\\r\n]/g, ' ')}" <${address}>`;

export const toTemplateView = (template: EmailTemplate): EmailTemplateView => ({
  id: template.id,
  name: template.name,
  kind: template.kind,
  subject: template.subject,
  body: template.body,
  isDefault: false,
  updatedAt: template.updatedAt,
});

/** Edited defaults replace the built-in ones; customs follow. */
export function mergeTemplates(stored: readonly EmailTemplate[], locale: Locale): readonly EmailTemplateView[] {
  const defaults = SINGLETON_TEMPLATE_KINDS.map((kind): EmailTemplateView => {
    const edited = stored.find((template) => template.kind === kind);
    if (edited) return toTemplateView(edited);
    return { id: `${DEFAULT_TEMPLATE_PREFIX}${kind}`, kind, ...defaultEmailTemplate(kind, locale), isDefault: true, updatedAt: null };
  });
  const customs = stored.filter((template) => !isSingletonKind(template.kind)).map(toTemplateView);
  return [...defaults, ...customs];
}

export async function requireApplicationInOrganization(
  deps: Pick<MessagingDeps, 'applications'>,
  organizationId: string,
  id: string,
): Promise<Application> {
  const application = await deps.applications.findById(organizationId, id);
  if (!application) throw new NotFoundError('Application not found.');
  return application;
}

export interface ResolvedTemplate {
  readonly subject: string;
  readonly body: string;
}

/** A stored template by id, or a built-in default (`default:<kind>`, in the language of the ad). Null when it does not exist. */
export async function resolveTemplate(
  deps: Pick<MessagingDeps, 'templates'>,
  organizationId: string,
  templateId: string,
  language: Locale,
): Promise<ResolvedTemplate | null> {
  if (templateId.startsWith(DEFAULT_TEMPLATE_PREFIX)) {
    const kind = templateId.slice(DEFAULT_TEMPLATE_PREFIX.length) as EmailTemplateKind;
    if (!isSingletonKind(kind) || !(SINGLETON_TEMPLATE_KINDS as readonly string[]).includes(kind)) return null;
    const edited = await deps.templates.findByKind(organizationId, kind);
    return edited ?? defaultEmailTemplate(kind, language);
  }
  return deps.templates.findById(organizationId, templateId);
}
