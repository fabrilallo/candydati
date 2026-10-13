import type { Actor } from './actor.js';
import { ForbiddenError } from './errors.js';

/** The person an action is for: the user, or the user an agent or API key acts for. A system actor has none. */
export function toActorUserId(actor: Actor): string {
  const id = actor.type === 'user' ? actor.id : actor.onBehalfOfUserId;
  if (id === null) throw new ForbiddenError('This needs a person.');
  return id;
}
