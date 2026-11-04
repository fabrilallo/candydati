import { isRole, roleNeedsTwoFactor, type ConsentPreview } from '@candydati/domain';
import type { ConnectedAppRepository } from '../../connected-app-ports.js';
import { NotFoundError } from '../../errors.js';
import type { SecuritySettingsRepository } from '../../security-ports.js';

export interface PreviewConsentDeps {
  readonly connectedApps: Pick<ConnectedAppRepository, 'findClient' | 'membershipsOf'>;
  readonly securitySettings: Pick<SecuritySettingsRepository, 'get'>;
}

/** What the signed authorization request says (its signature was checked by the caller) and who is looking. */
export interface PreviewConsentInput {
  readonly userId: string;
  readonly twoFactorEnabled: boolean;
  readonly activeOrganizationId: string | null;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

/**
 * What the consent page shows before a person connects an app: who asks (as the app declared itself), where the
 * browser goes afterwards, and the organizations the person may connect it to, with their role there. Read-only and
 * about the person's own memberships, so it needs no organization of its own; nothing is audited until they accept.
 */
export async function previewConsent(deps: PreviewConsentDeps, input: PreviewConsentInput): Promise<ConsentPreview> {
  const client = await deps.connectedApps.findClient(input.clientId);
  if (!client || !client.redirectUris.includes(input.redirectUri)) throw new NotFoundError('Unknown application.');
  const memberships = (await deps.connectedApps.membershipsOf(input.userId)).flatMap((m) => (isRole(m.role) ? [{ ...m, role: m.role }] : []));
  const organizations = await Promise.all(
    memberships.map(async (m) => ({
      id: m.organizationId,
      name: m.organizationName,
      role: m.role,
      active: m.organizationId === input.activeOrganizationId,
      twoFactorRequired: roleNeedsTwoFactor(m.role) && !input.twoFactorEnabled && (await deps.securitySettings.get(m.organizationId)).requireTwoFactor,
    })),
  );
  return {
    client: { clientId: client.clientId, name: client.name, uri: client.uri, icon: client.icon, redirectUri: input.redirectUri },
    scopes: [...input.scopes],
    organizations,
  };
}
