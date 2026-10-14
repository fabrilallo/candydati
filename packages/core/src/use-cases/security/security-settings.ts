import { z } from 'zod';
import type { SecurityDeps, SecuritySettings } from '../../security-ports.js';
import { defineUseCase } from '../../use-case.js';

/** Read by every member: the web app shows owners and admins what their organization requires. */
export const getSecuritySettings = defineUseCase<SecurityDeps, z.ZodObject<Record<string, never>>, SecuritySettings>({
  name: 'getSecuritySettings',
  input: z.object({}),
  permission: { skip: 'every member may read what the organization requires of them' },
  audit: { skip: 'read-only setting' },
  handler: ({ deps, actor }) => deps.securitySettings.get(actor.organizationId),
});

const setInput = z.object({ requireTwoFactor: z.boolean() });

/**
 * Turns "owners and admins need two-factor authentication" on or off. Owners and admins (`organization:update`); never
 * an API key or the agent (the route is session-only). Turning it on does not lock anyone out: each person is asked to
 * enrol on their next request.
 */
export const setSecuritySettings = defineUseCase<SecurityDeps, typeof setInput, SecuritySettings>({
  name: 'setSecuritySettings',
  input: setInput,
  permission: 'organization:update',
  audit: {
    action: 'organization.security_setting_updated',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input) => ({ requireTwoFactor: input.requireTwoFactor }),
  },
  handler: ({ deps, actor, input }) => deps.securitySettings.setRequireTwoFactor(actor.organizationId, input.requireTwoFactor, deps.now()),
});
