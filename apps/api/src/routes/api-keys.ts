import { createApiKey, listApiKeys, revokeApiKey } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { toApiKeyDto } from './api-key-dto.js';
import { bodyOf, paramOf } from './request.js';

/**
 * Keys of the organization. Session only: a request carrying a bearer is refused before anything runs, so a key can
 * never create, list or revoke keys (and the permission is on the machine forbidden list anyway).
 */
export function registerApiKeyRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.apiKeyDeps;
  const dtoOf = async (key: Parameters<typeof toApiKeyDto>[0]) => toApiKeyDto(key, await ctx.userNames(key.organizationId, [key.createdBy]));

  app.get('/api/v1/api-keys', async (request) => {
    const actor = await ctx.resolveSessionActor(request);
    const keys = await listApiKeys(deps, actor, {});
    const names = await ctx.userNames(actor.organizationId, keys.map((key) => key.createdBy));
    return ok(keys.map((key) => toApiKeyDto(key, names)));
  });

  app.post('/api/v1/api-keys', async (request, reply) => {
    const { key, secret } = await createApiKey(deps, await ctx.resolveSessionActor(request), bodyOf(request));
    return reply.status(201).send(ok({ key: await dtoOf(key), secret }));
  });

  const revoke = async (request: FastifyRequest) =>
    ok(await dtoOf(await revokeApiKey(deps, await ctx.resolveSessionActor(request), { keyId: paramOf(request, 'id') })));

  app.post('/api/v1/api-keys/:id/revoke', revoke);
  app.delete('/api/v1/api-keys/:id', revoke);
}
