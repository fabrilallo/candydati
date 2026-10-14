import { z } from 'zod';
import type { SecurityDeps, SecuritySettings } from '../../security-ports.js';
import { defineUseCase } from '../../use-case.js';
import { suspendedByTwoFactor } from '../api-keys/authenticate-api-key.js';

/** Read by every member: the web app shows owners and admins what their organization requires. */
export const getSecuritySettings = defineUseCase<SecurityDeps, z.ZodObject<Record<string, never>>, SecuritySettings>({
  name: 'getSecuritySettings',
  input: z.object({}),
  permission: { skip: 'every member may read what the organization requires of them' },
  audit: { skip: 'read-only setting' },
  handler: ({ deps, actor }) => deps.securitySettings.get(actor.organizationId),
});

const setInput = z.object({ requireTwoFactor: z.boolean() });

export interface SecuritySettingsUpdate extends SecuritySettings {
  /** Prefixes of the live API keys the requirement now suspends (creator an owner or admin without 2FA). */
  readonly suspendedApiKeys: readonly string[];
}

/** Live keys (not revoked, not expired) whose creator the requirement now blocks; they work again once the creator enrols. */
async function suspendedKeys(deps: SecurityDeps, organizationId: string, now: Date): Promise<readonly string[]> {
  const prefixes: string[] = [];
  for (const key of await deps.apiKeys.list(organizationId)) {
    if (key.revokedAt !== null || key.expiresAt.getTime() <= now.getTime()) continue;
    const role = await deps.memberRoles.roleOf(organizationId, key.createdBy);
    if (role !== null && (await suspendedByTwoFactor(deps, organizationId, key.createdBy, role))) prefixes.push(key.prefix);
  }
  return prefixes;
}

/**
 * Turns "owners and admins need two-factor authentication" on or off. Owners and admins (`organization:update`); never
 * an API key or the agent (the route is session-only). Turning it on does not lock anyone out: each person is asked to
 * enrol on their next request. Their API keys are suspended until they do, and the audit entry lists them.
 */
export const setSecuritySettings = defineUseCase<SecurityDeps, typeof setInput, SecuritySettingsUpdate>({
  name: 'setSecuritySettings',
  input: setInput,
  permission: 'organization:update',
  audit: {
    action: 'organization.security_setting_updated',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input, result: SecuritySettingsUpdate) => ({ requireTwoFactor: input.requireTwoFactor, suspendedApiKeys: result.suspendedApiKeys }),
  },
  handler: async ({ deps, actor, input }): Promise<SecuritySettingsUpdate> => {
    const now = deps.now();
    const settings = await deps.securitySettings.setRequireTwoFactor(actor.organizationId, input.requireTwoFactor, now);
    const suspendedApiKeys = settings.requireTwoFactor ? await suspendedKeys(deps, actor.organizationId, now) : [];
    return { ...settings, suspendedApiKeys };
  },
});
