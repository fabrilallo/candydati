import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { can } from '../../authorization.js';
import type { ConnectedAppDeps, ConnectedAppGrant } from '../../connected-app-ports.js';
import { ForbiddenError, NotFoundError } from '../../errors.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

const define = <S extends z.ZodType, O>(definition: UseCaseDefinition<ConnectedAppDeps, S, O>): UseCase<ConnectedAppDeps, O> =>
  defineUseCase<ConnectedAppDeps, S, O>(definition);

/**
 * A person manages the apps they connected; owners and admins (who manage the organization's machine access, the
 * `api_key:manage` permission) see and revoke every app connected in it. Machines never do: a key or a connected app
 * cannot list or revoke connections.
 */
const OWN_GRANTS = 'every member manages the apps they connected; reading others needs api_key:manage (checked in the handler)';

function personOf(actor: Actor): string {
  if (actor.type !== 'user') throw new ForbiddenError('Only a person manages connected apps.');
  return actor.id;
}

const seesEveryGrant = (actor: Actor): boolean => can(actor, 'api_key:manage');

export const listConnectedApps = define({
  name: 'listConnectedApps',
  input: z.object({}),
  permission: { skip: OWN_GRANTS },
  audit: { skip: 'read of account settings' },
  handler: async ({ deps, actor }): Promise<readonly ConnectedAppGrant[]> => {
    const userId = personOf(actor);
    return deps.connectedApps.list(actor.organizationId, seesEveryGrant(actor) ? null : userId);
  },
});

const grantMetadata = (grant: ConnectedAppGrant) => ({ clientId: grant.clientId, clientName: grant.clientName, userId: grant.userId });

/** Deletes the grant and every token of it: the app's next call is refused, its refresh token is dead. */
export const revokeConnectedApp = define({
  name: 'revokeConnectedApp',
  input: z.object({ grantId: z.string().min(1).max(200) }),
  permission: { skip: OWN_GRANTS },
  audit: {
    action: 'connected_app.revoked',
    target: (_input, grant: ConnectedAppGrant) => ({ type: 'connected_app', id: grant.id }),
    metadata: (_input, grant: ConnectedAppGrant) => grantMetadata(grant),
  },
  handler: async ({ deps, actor, input }): Promise<ConnectedAppGrant> => {
    const userId = personOf(actor);
    const grant = await deps.connectedApps.findById(actor.organizationId, input.grantId);
    // Someone else's grant does not exist for a member who may not see it.
    if (!grant || (grant.userId !== userId && !seesEveryGrant(actor))) throw new NotFoundError('Connected app not found.');
    await deps.connectedApps.revoke(grant);
    return grant;
  },
});

/**
 * Audits the connection a person just granted on the consent page (Better Auth stored it). The actor is that person in
 * the organization they picked; the grant must exist, or nothing is recorded.
 */
export const recordConnectedAppGrant = define({
  name: 'recordConnectedAppGrant',
  input: z.object({ clientId: z.string().min(1).max(200) }),
  permission: { skip: 'the person grants an app access to what they themselves may do; membership was checked at consent' },
  audit: {
    action: 'connected_app.granted',
    target: (_input, grant: ConnectedAppGrant) => ({ type: 'connected_app', id: grant.id }),
    metadata: (_input, grant: ConnectedAppGrant) => ({ clientId: grant.clientId, clientName: grant.clientName, scopes: grant.scopes }),
  },
  handler: async ({ deps, actor, input }): Promise<ConnectedAppGrant> => {
    const userId = personOf(actor);
    const grant = await deps.connectedApps.findGrant(actor.organizationId, input.clientId, userId);
    if (!grant) throw new NotFoundError('Connected app not found.');
    return grant;
  },
});
