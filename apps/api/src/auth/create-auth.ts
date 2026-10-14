import type { CoreDeps } from '@tt/core';
import type { Db } from '@tt/db';
import { schema } from '@tt/db';
import { CREATOR_ROLE, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@tt/domain';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, twoFactor } from 'better-auth/plugins';
import type { Env } from '../config/env.js';
import { buildAccessControl } from './access-control.js';
import type { AccountMailer } from './account-mailer.js';
import { createActorLookups, type SessionUserResolver } from './actor-lookups.js';
import { createAuditHooks } from './audit-hooks.js';
import { createAuthEmails, type AuthEmails } from './auth-emails.js';
import { roleGuardHooks } from './role-guards.js';
import { createSignupLookups, signupPolicyHook } from './signup-policy.js';

export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** The verification link works for 24 hours, the reset link for 1 hour (the email texts say so). */
export const VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
export const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

export interface AuthDependencies {
  readonly env: Env;
  readonly db: Db;
  /** Audit log and unit of work for the organization hooks. */
  readonly core: CoreDeps;
  /** Account emails (verify, reset, invitation) through the configured EmailProvider. */
  readonly mailer: AccountMailer;
}

/** Email + password: no session until the address is confirmed, a known address answers like a new one, reset by email. */
const credentialOptions = (emails: AuthEmails) => ({
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    requireEmailVerification: true,
    onExistingUserSignUp: emails.existingAccount,
    sendResetPassword: emails.resetPassword,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendVerificationEmail: emails.verifyEmail,
    sendOnSignUp: true,
    // A person who signs in before confirming gets a fresh link (the sign-in still answers 403 EMAIL_NOT_VERIFIED).
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_TTL_SECONDS,
  },
});

/**
 * Email + password with a verified address, password reset, optional TOTP, organizations with the domain's roles,
 * and an audit event for every organization action. The auth base URL is the WEB origin: the browser reaches this
 * api through the web app's /api/** proxy, so the links in the emails go through it too.
 */
export function createAuth({ env, db, core, mailer }: AuthDependencies) {
  const { ac, roles } = buildAccessControl();
  // The hooks need the session of the request being served, which only exists once `auth` is built.
  let resolveSessionUser: SessionUserResolver = async () => null;
  const lookups = createActorLookups(db, () => resolveSessionUser);
  const emails = createAuthEmails(mailer, env.platform);

  const auth = betterAuth({
    appName: env.platform.name,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN, ...env.TRUSTED_ORIGINS],
    advanced: {
      // Explicit: Better Auth switches the origin/CSRF check off when NODE_ENV=test unless told otherwise.
      disableOriginCheck: false,
      // Emails never delay the answer: its timing must not tell whether an address has an account.
      backgroundTasks: { handler: (task) => void task },
    },
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    ...credentialOptions(emails),
    session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 24 * 60 * 60 },
    hooks: { before: signupPolicyHook(env.SIGNUP_MODE, createSignupLookups(db)) },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: CREATOR_ROLE,
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        // Only a confirmed account whose address is the invited one can accept (Better Auth checks the address too).
        requireEmailVerificationOnInvitation: true,
        // audit_log.organization_id is ON DELETE RESTRICT: an organization with history cannot be hard-deleted.
        disableOrganizationDeletion: true,
        sendInvitationEmail: emails.invitation,
        organizationHooks: { ...roleGuardHooks, ...createAuditHooks({ core, lookups }) },
      }),
      // TOTP with backup codes; enforcement for owners and admins is an organization setting (security settings).
      twoFactor({ issuer: env.platform.name }),
    ],
  });

  resolveSessionUser = async (headers) => (await auth.api.getSession({ headers }))?.user.id ?? null;
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
