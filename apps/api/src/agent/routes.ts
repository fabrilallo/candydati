import { Readable } from 'node:stream';
import { handleChatStream } from '@mastra/ai-sdk';
import type { Mastra } from '@mastra/core';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ForbiddenError, type Actor } from '@tt/core';
import { fail, ok } from '@tt/domain';
import { createUIMessageStreamResponse } from 'ai';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ASSISTANT_AGENT_ID } from './assistant.js';
import { toAgentActor } from './agent-actor.js';
import { agentStatus, type AgentStatus } from './config.js';
import type { JobDrafter } from './job-drafter.js';
import { chatMessagesSchema, MAX_CHAT_MESSAGES, trimHistory } from './history.js';
import { buildAgentRequestContext, pageContextSchema } from './request-context.js';
import { createAgentRuntime, type AgentContext } from './runtime.js';

export const AGENT_DISABLED_CODE = 'agent_disabled';
export const CHAT_BODY_LIMIT = 512 * 1024;
export const CHAT_RATE_LIMIT_PER_MINUTE = 30;
export { MAX_CHAT_MESSAGES };
const STREAM_ERROR_MESSAGE = 'The assistant could not answer. Please try again in a moment.';

const chatBodySchema = z.object({
  messages: chatMessagesSchema,
  page: pageContextSchema.nullish(),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
});

export interface AgentRouteContext extends AgentContext {
  /** Session cookie only: an API key never reaches the assistant. */
  readonly resolveSessionActor: (request: FastifyRequest) => Promise<Actor>;
}

export interface AgentRouteOptions {
  /** Tests: a mock model instead of AGENT_MODEL (the assistant is then enabled). */
  readonly model?: MastraModelConfig | undefined;
  readonly draftJob?: JobDrafter | undefined;
}

const sendWebResponse = (response: Response, reply: FastifyReply): FastifyReply => {
  reply.status(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  return reply.send(response.body ? Readable.fromWeb(response.body as never) : null);
};

const userOf = async (ctx: AgentRouteContext, request: FastifyRequest) => {
  const actor = await ctx.resolveSessionActor(request);
  if (actor.type !== 'user') throw new ForbiddenError('The assistant acts only for a signed-in person.');
  return actor;
};

function lazy<T>(create: () => T): () => T {
  let value: { readonly v: T } | null = null;
  return () => (value ??= { v: create() }).v;
}

/** GET status and POST chat (AI SDK UI message stream). Stateless: nothing of the conversation is stored on the server. Session-authenticated like every /api/v1 route. */
export function registerAgentRoutes(app: FastifyInstance, ctx: AgentRouteContext, options: AgentRouteOptions = {}): void {
  const status: AgentStatus = options.model ? { enabled: true, model: 'test/mock' } : agentStatus(ctx.env.AGENT_MODEL);
  const model = options.model ?? (ctx.env.AGENT_MODEL as MastraModelConfig | undefined);
  const onToolError = (error: unknown, tool: string) => app.log.error({ err: error, tool }, 'agent tool failed');
  const runtime = lazy((): Mastra => createAgentRuntime(ctx, { model: model!, draftJob: options.draftJob, onToolError }));

  app.get('/api/v1/agent/status', async (request) => {
    await userOf(ctx, request);
    return ok(status);
  });

  app.post(
    '/api/v1/agent/chat',
    { bodyLimit: CHAT_BODY_LIMIT, config: { rateLimit: { max: CHAT_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = await userOf(ctx, request);
      if (!status.enabled) return reply.status(503).send(fail(AGENT_DISABLED_CODE, 'The assistant is not configured on this instance.'));
      const body = chatBodySchema.safeParse(request.body);
      if (!body.success) return reply.status(422).send(fail('validation_failed', body.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')));
      const messages = trimHistory(body.data.messages);
      if (messages.length === 0) return reply.status(422).send(fail('validation_failed', 'messages: the last message is too large or no user message is left'));
      const stream = await handleChatStream({
        mastra: runtime(),
        agentId: ASSISTANT_AGENT_ID,
        version: 'v7',
        params: {
          messages: messages as never,
          ...(body.data.trigger ? { trigger: body.data.trigger } : {}),
          requestContext: buildAgentRequestContext({ actor: toAgentActor(user), user }, body.data.page ?? null),
        },
        onError: (error) => {
          request.log.error({ err: error, organizationId: user.organizationId }, 'agent chat stream failed');
          return STREAM_ERROR_MESSAGE;
        },
      });
      return sendWebResponse(createUIMessageStreamResponse({ stream }), reply);
    },
  );
}
