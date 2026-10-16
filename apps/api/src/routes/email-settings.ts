import { getEmailSettings, toEmailSettingsDto, updateEmailSettings, verifyEmailDomain } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

/** The organization's sending identity. Thin adapters over the messaging use cases. */
export function registerEmailSettingsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.messagingDeps;

  app.get('/api/v1/email-settings', async (request) =>
    ok(toEmailSettingsDto(await getEmailSettings(deps, await ctx.resolveActor(request), {}))),
  );

  app.put('/api/v1/email-settings', async (request) =>
    ok(toEmailSettingsDto(await updateEmailSettings(deps, await ctx.resolveActor(request), request.body))),
  );

  app.post('/api/v1/email-settings/verify', async (request) =>
    ok(toEmailSettingsDto(await verifyEmailDomain(deps, await ctx.resolveActor(request), {}))),
  );
}
