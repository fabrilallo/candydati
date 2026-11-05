import {
  addSkillAlias,
  disableBuiltInSkillAlias,
  enableBuiltInSkillAlias,
  listSkillAliases,
  removeSkillAlias,
  toSkillAliasDto,
  toSkillAliasOverviewDto,
} from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, paramOf } from './request.js';

/**
 * The organization's own skill aliases on top of the built-in dictionary (ADR 0010). Thin adapters over the skill use
 * cases; the person who manages them is an owner or an admin.
 */
export function registerSkillAliasRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.skillAliasDeps;

  app.get('/api/v1/skill-aliases', async (request) => ok(toSkillAliasOverviewDto(await listSkillAliases(deps, await ctx.resolveActor(request), {}))));

  app.post('/api/v1/skill-aliases', async (request, reply) => reply.status(201).send(ok(toSkillAliasDto(await addSkillAlias(deps, await ctx.resolveActor(request), bodyOf(request))))));

  app.delete('/api/v1/skill-aliases/:id', async (request) => {
    await removeSkillAlias(deps, await ctx.resolveActor(request), { aliasId: paramOf(request, 'id') });
    return ok({ deleted: true });
  });

  /** Switches a built-in alias off or on for the organization. The answer says what it is now. */
  app.post('/api/v1/skill-aliases/built-in/disable', async (request) => {
    const { alias } = await disableBuiltInSkillAlias(deps, await ctx.resolveActor(request), bodyOf(request));
    return ok({ alias, enabled: false });
  });

  app.post('/api/v1/skill-aliases/built-in/enable', async (request) => {
    const { alias } = await enableBuiltInSkillAlias(deps, await ctx.resolveActor(request), bodyOf(request));
    return ok({ alias, enabled: true });
  });
}
