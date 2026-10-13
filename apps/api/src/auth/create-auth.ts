import type { AuditLogRepository } from '@tt/core';
import type { Db } from '@tt/db';
import { schema } from '@tt/db';
import { CREATOR_ROLE, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@tt/domain';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import type { Env } from '../config/env.js';
import { buildAccessControl } from './access-control.js';
import { createActorLookups, type SessionUserResolver } from './actor-lookups.js';
import { createAuditHooks } from './audit-hooks.js';
import { acceptInvitationUrl, type EmailSender } from './email-sender.js';
import { roleGuardHooks } from './role-guards.js';

export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AuthDependencies {
  readonly env: Env;
  readonly db: Db;
  readonly auditLog: AuditLogRepository;
  readonly emailSender: EmailSender;
}

/**
 * Email + password, organizations with the domain's roles, and an audit event for every organization action.
 * The auth base URL is the WEB origin: the browser reaches this api through the web app's /api/** proxy.
 */
export function createAuth({ env, db, auditLog, emailSender }: AuthDependencies) {
  const { ac, roles } = buildAccessControl();
  // The hooks need the session of the request being served, which only exists once `auth` is built.
  let resolveSessionUser: SessionUserResolver = async () => null;
  const lookups = createActorLookups(db, () => resolveSessionUser);

  const auth = betterAuth({
    appName: env.platform.name,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN, ...env.TRUSTED_ORIGINS],
    // Explicit: Better Auth switches the origin/CSRF check off when NODE_ENV=test unless told otherwise.
    advanced: { disableOriginCheck: false },
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH, maxPasswordLength: PASSWORD_MAX_LENGTH },
    session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 24 * 60 * 60 },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: CREATOR_ROLE,
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        // audit_log.organization_id is ON DELETE RESTRICT: an organization with history cannot be hard-deleted.
        disableOrganizationDeletion: true,
        sendInvitationEmail: async (data) =>
          emailSender.sendInvitation({
            to: data.email,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            role: data.role,
            acceptUrl: acceptInvitationUrl(env.platform.url, data.id),
          }),
        organizationHooks: { ...roleGuardHooks, ...createAuditHooks({ auditLog, lookups }) },
      }),
    ],
  });

  resolveSessionUser = async (headers) => (await auth.api.getSession({ headers }))?.user.id ?? null;
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
