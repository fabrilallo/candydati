import { getSecuritySettings, setSecuritySettings } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

/** Organization security settings. Session only: an API key can neither read nor change what protects the accounts. */
export function registerSecuritySettingsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/settings/security', async (request) =>
    ok(await getSecuritySettings(ctx.securityDeps, await ctx.resolveSessionActor(request), {})),
  );
  app.put('/api/v1/settings/security', async (request) =>
    ok(await setSecuritySettings(ctx.securityDeps, await ctx.resolveSessionActor(request), request.body)),
  );
}
