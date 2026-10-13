import type { Actor, DelegatedActor } from '@tt/core';
import { ForbiddenError } from '@tt/core';
import { grantablePermissions, type Permission } from '@tt/domain';

/** Audit id of the internal assistant: every action it takes is recorded as `agent:assistant` on behalf of a user. */
export const AGENT_ID = 'assistant';

/**
 * What the assistant's tools need, and nothing else. Intersected with what the role can hand to an agent, so the
 * agent never has more than the person and never a machine-forbidden permission. Publishing, closing, moving,
 * deciding and sending are absent on purpose: those stay with a person (PLAN §1 principle 4, §6).
 */
export const AGENT_TOOL_PERMISSIONS: readonly Permission[] = [
  'job:read',
  'job:update',
  'job_template:read',
  'candidate:read',
  'message:read',
  'task:manage',
];

export const agentScopes = (actor: Pick<Actor, 'role'>): readonly Permission[] =>
  grantablePermissions(actor.role, 'agent').filter((permission) => AGENT_TOOL_PERMISSIONS.includes(permission));

/** The actor every tool call runs as: the signed-in person's role and organization, narrowed to the agent scopes. */
export function toAgentActor(actor: Actor): DelegatedActor {
  if (actor.type !== 'user') throw new ForbiddenError('The assistant acts only for a signed-in person.');
  return {
    type: 'agent',
    id: AGENT_ID,
    onBehalfOfUserId: actor.id,
    organizationId: actor.organizationId,
    role: actor.role,
    scopes: agentScopes(actor),
  };
}

