import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { listConnectedApps, parseInput, previewConsent, revokeConnectedApp, ValidationError, type ConnectedAppGrant } from '@candydati/core';
import { consentPreviewRequestSchema, ok, type ConnectedApp } from '@candydati/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { sessionFromRequest } from '../auth/fastify-auth.js';
import { hasBearer } from '../http/bearer.js';
import { AccountGateError, ForbiddenError, UnauthenticatedError } from '../http/errors.js';
import type { UserNames } from '../http/audit-dto.js';
import { bodyOf, paramOf } from './request.js';

const toDto = (grant: ConnectedAppGrant, names: UserNames): ConnectedApp => ({
  id: grant.id,
  clientId: grant.clientId,
  clientName: grant.clientName,
  clientUri: grant.clientUri,
  userId: grant.userId,
  userName: names.get(grant.userId) ?? null,
  scopes: [...grant.scopes],
  connectedAt: grant.createdAt.toISOString(),
  updatedAt: grant.updatedAt.toISOString(),
});

/** The signed-in person (cookie only, no organization needed): the consent page may be their first stop. */
async function consentSubject(ctx: AppContext, request: FastifyRequest) {
  if (hasBearer(request.headers)) throw new ForbiddenError('Connecting an app needs a signed-in person.');
  const session = await sessionFromRequest(ctx.auth, request);
  if (!session) throw new UnauthenticatedError();
  const user = session.user as { id: string; emailVerified: boolean; twoFactorEnabled?: boolean | null };
  if (!user.emailVerified) throw new AccountGateError('email_not_verified', 'Confirm your email address first.');
  const active: unknown = session.session.activeOrganizationId;
  return { userId: user.id, twoFactorEnabled: user.twoFactorEnabled === true, activeOrganizationId: typeof active === 'string' && active !== '' ? active : null };
}

/** The authorization request the consent page holds, trusted only when Better Auth's signature over it is valid. */
async function signedRequest(ctx: AppContext, request: FastifyRequest) {
  const { oauthQuery } = parseInput(consentPreviewRequestSchema, bodyOf(request));
  if (!(await verifyOAuthQueryParams(oauthQuery, ctx.env.BETTER_AUTH_SECRET))) {
    throw new ValidationError([{ path: 'oauthQuery', message: 'The authorization request is invalid or expired. Start again from the app.' }]);
  }
  const params = new URLSearchParams(oauthQuery);
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  if (!clientId || !redirectUri) throw new ValidationError([{ path: 'oauthQuery', message: 'client_id and redirect_uri are required.' }]);
  return { clientId, redirectUri, scopes: (params.get('scope') ?? '').split(' ').filter((scope) => scope !== '') };
}

/**
 * Apps a person connected with OAuth (Claude custom connectors): the consent page's preview, the settings list and
 * revocation. Session only: a key or a connected app never manages connections.
 */
export function registerConnectedAppRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.connectedAppDeps;

  app.post('/api/v1/connected-apps/consent-preview', async (request) => {
    const subject = await consentSubject(ctx, request);
    const signed = await signedRequest(ctx, request);
    return ok(await previewConsent({ connectedApps: deps.connectedApps, securitySettings: ctx.securityDeps.securitySettings }, { ...subject, ...signed }));
  });

  app.get('/api/v1/connected-apps', async (request) => {
    const actor = await ctx.resolveSessionActor(request);
    const grants = await listConnectedApps(deps, actor, {});
    const names = await ctx.userNames(actor.organizationId, grants.map((grant) => grant.userId));
    return ok(grants.map((grant) => toDto(grant, names)));
  });

  const revoke = async (request: FastifyRequest) => {
    const actor = await ctx.resolveSessionActor(request);
    const grant = await revokeConnectedApp(deps, actor, { grantId: paramOf(request, 'id') });
    return ok(toDto(grant, await ctx.userNames(actor.organizationId, [grant.userId])));
  };
  app.post('/api/v1/connected-apps/:id/revoke', revoke);
  app.delete('/api/v1/connected-apps/:id', revoke);
}
