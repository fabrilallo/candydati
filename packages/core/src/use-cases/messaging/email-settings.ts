import { emailSettingsInputSchema, type DomainStatus, type EmailSettings } from '@tt/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import type { DomainCheck, MessagingDeps } from '../../messaging-ports.js';
import { defineMessagingUseCase } from './define.js';
import { formatFrom, requireOrganization, senderIdentity } from './shared.js';
import type { EmailSettingsView } from './views.js';
import { sequential } from '../../sequential.js';

const toView = (deps: Pick<MessagingDeps, 'config'>, organization: { name: string }, settings: EmailSettings | null): EmailSettingsView => ({
  senderName: settings?.senderName ?? organization.name,
  fromAddress: settings?.fromAddress ?? null,
  domain:
    settings?.domain && settings.domainStatus
      ? { name: settings.domain, status: settings.domainStatus, records: settings.domainRecords }
      : null,
  effectiveFrom: formatFrom(senderIdentity(deps.config, organization, settings)),
});

/** A provider outage must not block saving: the domain stays `pending` and can be re-checked. */
const checkDomain = (deps: Pick<MessagingDeps, 'identity'>, domain: string): Promise<DomainCheck> =>
  deps.identity.domainStatus(domain).catch(() => ({ status: 'pending' as const, records: [] }));

const settingsAudit = {
  action: 'email_settings.updated',
  target: (_input: unknown, _view: EmailSettingsView, actor: { organizationId: string }) => ({ type: 'email_settings', id: actor.organizationId }),
  metadata: (_input: unknown, view: EmailSettingsView): Record<string, unknown> => ({ domainStatus: view.domain?.status ?? null }),
} as const;

export const getEmailSettings = defineMessagingUseCase({
  name: 'getEmailSettings',
  input: z.object({}),
  permission: 'message:read',
  audit: { skip: 'read of organization settings, no personal data' },
  handler: async ({ deps, actor }): Promise<EmailSettingsView> => {
    const [organization, settings] = await sequential(
      () => requireOrganization(deps, actor.organizationId),
      () => deps.settings.find(actor.organizationId),
    );
    return toView(deps, organization, settings);
  },
});

/** A new domain starts its check right away; the same domain keeps the status it had. */
export const updateEmailSettings = defineMessagingUseCase({
  name: 'updateEmailSettings',
  input: emailSettingsInputSchema,
  permission: 'email_settings:manage',
  audit: settingsAudit,
  handler: async ({ deps, actor, input }): Promise<EmailSettingsView> => {
    const organization = await requireOrganization(deps, actor.organizationId);
    const existing = await deps.settings.find(actor.organizationId);
    const domain = input.fromAddress === null ? null : (input.fromAddress.split('@')[1] ?? null);
    let status: DomainStatus | null = null;
    let records: EmailSettings['domainRecords'] = [];
    if (domain !== null && existing?.domain === domain && existing.domainStatus) {
      status = existing.domainStatus;
      records = existing.domainRecords;
    } else if (domain !== null) {
      ({ status, records } = await checkDomain(deps, domain));
    }
    const saved = await deps.settings.save({
      organizationId: actor.organizationId,
      senderName: input.senderName,
      fromAddress: input.fromAddress,
      domain,
      domainStatus: status,
      domainRecords: records,
      updatedAt: deps.now(),
    });
    return toView(deps, organization, saved);
  },
});

/** Re-checks the domain with the provider, after the organization published the DNS records. */
export const verifyEmailDomain = defineMessagingUseCase({
  name: 'verifyEmailDomain',
  input: z.object({}),
  permission: 'email_settings:manage',
  audit: settingsAudit,
  handler: async ({ deps, actor }): Promise<EmailSettingsView> => {
    const [organization, existing] = await sequential(
      () => requireOrganization(deps, actor.organizationId),
      () => deps.settings.find(actor.organizationId),
    );
    if (!existing?.domain) throw new ConflictError('No own domain is configured.');
    const check = await deps.identity.domainStatus(existing.domain).catch(() => {
      throw new ConflictError('The domain status is not available right now.');
    });
    const saved = await deps.settings.save({ ...existing, domainStatus: check.status, domainRecords: check.records, updatedAt: deps.now() });
    return toView(deps, organization, saved);
  },
});
