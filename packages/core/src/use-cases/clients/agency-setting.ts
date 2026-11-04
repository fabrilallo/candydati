import { agencySettingInputSchema, type AgencySetting } from '@candydati/domain';
import { z } from 'zod';
import { ForbiddenError } from '../../errors.js';
import { defineClientUseCase } from './define.js';

/** Whether the organization recruits for clients. Every member reads it: the interface shows clients only when it is on. */
export const getAgencySetting = defineClientUseCase({
  name: 'getAgencySetting',
  input: z.object({}),
  permission: 'client:read',
  audit: { skip: 'read-only setting' },
  handler: async ({ deps, actor }): Promise<AgencySetting> => {
    const settings = await deps.organizationSettings.get(actor.organizationId);
    return { recruitsForClients: settings.recruitsForClients, agencyAuthorization: settings.agencyAuthorization };
  },
});

/**
 * Turns "we recruit for clients" on or off, with the agency's authorization reference. Owners and admins, as people:
 * how the organization presents itself on its ads is not for a key or the assistant. Turning it off hides clients from
 * the interface; jobs keep their client and the ads keep saying so (the truth about an ad does not change with a setting).
 */
export const setAgencySetting = defineClientUseCase({
  name: 'setAgencySetting',
  input: agencySettingInputSchema,
  permission: 'organization:update',
  audit: {
    action: 'organization.agency_setting_updated',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input) => ({ recruitsForClients: input.recruitsForClients, authorization: input.agencyAuthorization !== null }),
  },
  handler: async ({ deps, actor, input }): Promise<AgencySetting> => {
    if (actor.type !== 'user') throw new ForbiddenError();
    const settings = await deps.organizationSettings.setAgency(actor.organizationId, input, deps.now());
    return { recruitsForClients: settings.recruitsForClients, agencyAuthorization: settings.agencyAuthorization };
  },
});
