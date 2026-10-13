import type { DelegatedActor, UserActor } from '@tt/core';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';

const ACTOR_KEY = 'tt.agentActor';
const USER_KEY = 'tt.user';
const PAGE_KEY = 'tt.page';

const ID = z.string().trim().min(1).max(100).regex(/^[\w-]+$/, 'id');

/** Where the person is in the app while talking: a hint for the prompt, never a permission (tools re-check everything). */
export const pageContextSchema = z.object({
  route: z.string().trim().min(1).max(200).regex(/^\/[\w\-/.~%]*$/, 'route'),
  jobId: ID.optional(),
  applicationId: ID.optional(),
});
export type PageContext = z.infer<typeof pageContextSchema>;

export interface AgentIdentity {
  /** Every tool call runs as this actor. */
  readonly actor: DelegatedActor;
  /** The person behind it: only to render a draft for them, never to write. */
  readonly user: UserActor;
}

/** Set on the server from the session only: nothing in the request body can change who the tools act for. */
export function buildAgentRequestContext(identity: AgentIdentity, page: PageContext | null): RequestContext {
  const context = new RequestContext();
  context.set(ACTOR_KEY, identity.actor);
  context.set(USER_KEY, identity.user);
  if (page) context.set(PAGE_KEY, page);
  return context;
}

type ContextReader = Pick<RequestContext, 'get'> | undefined;

/** Tools refuse to run without an identity: they are never callable outside a signed-in chat. */
export function readAgentIdentity(context: ContextReader): AgentIdentity {
  const actor = context?.get(ACTOR_KEY) as DelegatedActor | undefined;
  const user = context?.get(USER_KEY) as UserActor | undefined;
  if (actor?.type !== 'agent' || user?.type !== 'user') throw new Error('assistant tools need an agent identity in the request context');
  return { actor, user };
}

export const readPageContext = (context: ContextReader): PageContext | null => {
  const parsed = pageContextSchema.safeParse(context?.get(PAGE_KEY));
  return parsed.success ? parsed.data : null;
};
