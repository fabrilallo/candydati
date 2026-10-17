import type { CoreDeps } from '@candydati/core';
import type { Db } from '@candydati/db';
import { schema } from '@candydati/db';
import { CREATOR_ROLE, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@candydati/domain';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, twoFactor } from 'better-auth/plugins';
import type { Env } from '../config/env.js';
import { buildAccessControl } from './access-control.js';
import type { AccountMailer } from './account-mailer.js';
import { createActorLookups, type SessionUserResolver } from './actor-lookups.js';
import { createAuditHooks } from './audit-hooks.js';
import { createAuthEmails, type AuthEmails } from './auth-emails.js';
import { firstOwnerDatabaseHooks } from './first-owner-hooks.js';
import { bootstrapTokenFor } from './first-owner-setup.js';
import { roleGuardHooks } from './role-guards.js';
import { createOrganizationGateLookups, organizationTwoFactorCheck } from './organization-two-factor-gate.js';
import { findMemberRole } from './member-role.js';
import { createOrganizationCreationLookups, organizationCreationAllowed, organizationCreationHooks } from './organization-creation.js';
import { createSignupLookups, emailVerificationCheck, signupPolicyCheck, type SignupPolicy } from './signup-policy.js';

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
  /** The organization requires 2FA of owners and admins: the same setting the actor resolver reads. */
  readonly requiresTwoFactor: (organizationId: string) => Promise<boolean>;
  /** The instance can send email: an invitation is an email, so none is created before. Absent: ready. */
  readonly emailReady?: (() => boolean) | undefined;
}

/** Better Auth error code of an invitation refused while the instance cannot send email (the web app translates it). */
export const EMAIL_NOT_CONFIGURED_CODE = 'EMAIL_NOT_CONFIGURED';

const signupPolicy = (env: Env): SignupPolicy => ({ mode: env.SIGNUP_MODE, bootstrapToken: bootstrapTokenFor(env), requireBootstrapToken: env.NODE_ENV === 'production' });

/**
 * Email + password: no session until the address is confirmed, a known address answers like a new one, reset by email.
 * Confirming the address checks the sign-up policy again (a bootstrap claim may have lapsed since the sign-up).
 */
const credentialOptions = (emails: AuthEmails, beforeEmailVerification: (user: { id: string; email: string }, request?: Request) => Promise<void>) => ({
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
    beforeEmailVerification,
  },
});

/** Every `hooks.before` step, in order: the sign-up policy, then the 2FA requirement on organization changes. */
const beforeHooks = (env: Env, db: Db, requiresTwoFactor: AuthDependencies['requiresTwoFactor']) => {
  const signup = signupPolicyCheck(signupPolicy(env), createSignupLookups(db));
  const twoFactor = organizationTwoFactorCheck(createOrganizationGateLookups(db, requiresTwoFactor, (userId, organizationId) => findMemberRole(db, userId, organizationId)));
  return createAuthMiddleware(async (ctx) => {
    await signup(ctx);
    await twoFactor(ctx);
  });
};

/**
 * Better Auth takes one function per organization hook: the role guards check the logo before the creation slot is
 * claimed (a refused logo uses no slot), and the creation is recorded before it is audited.
 */
const organizationHooks = (creation: ReturnType<typeof organizationCreationHooks>, audit: ReturnType<typeof createAuditHooks>, emailReady: () => boolean) => ({
  ...roleGuardHooks,
  ...audit,
  beforeCreateInvitation: async (data: Parameters<typeof roleGuardHooks.beforeCreateInvitation>[0]) => {
    if (!emailReady()) throw new APIError('BAD_REQUEST', { code: EMAIL_NOT_CONFIGURED_CODE, message: 'Set up email first: an invitation is sent by email.' });
    await roleGuardHooks.beforeCreateInvitation(data);
  },
  beforeCreateOrganization: async (data: Parameters<typeof creation.beforeCreateOrganization>[0] & Parameters<typeof roleGuardHooks.beforeCreateOrganization>[0]) => {
    await roleGuardHooks.beforeCreateOrganization(data);
    await creation.beforeCreateOrganization(data);
  },
  afterCreateOrganization: async (data: Parameters<typeof audit.afterCreateOrganization>[0] & Parameters<typeof creation.afterCreateOrganization>[0]) => {
    await creation.afterCreateOrganization(data);
    await audit.afterCreateOrganization(data);
  },
});

/**
 * Email + password with a verified address, password reset, optional TOTP, organizations with the domain's roles,
 * and an audit event for every organization action. The auth base URL is the WEB origin: the browser reaches this
 * api through the web app's /api/** proxy, so the links in the emails go through it too.
 */
export function createAuth({ env, db, core, mailer, requiresTwoFactor, emailReady = () => true }: AuthDependencies) {
  const { ac, roles } = buildAccessControl();
  // The hooks need the session of the request being served, which only exists once `auth` is built.
  let resolveSessionUser: SessionUserResolver = async () => null;
  const lookups = createActorLookups(db, () => resolveSessionUser);
  const emails = createAuthEmails(mailer, env.platform);
  const creationPolicy = { mode: env.ORGANIZATION_CREATION, instanceAdmins: env.INSTANCE_ADMIN_EMAILS };
  const creationLookups = createOrganizationCreationLookups(db);

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
    ...credentialOptions(emails, emailVerificationCheck(signupPolicy(env), createSignupLookups(db))),
    session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 24 * 60 * 60 },
    hooks: { before: beforeHooks(env, db, requiresTwoFactor) },
    databaseHooks: firstOwnerDatabaseHooks(signupPolicy(env), createSignupLookups(db)),
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: CREATOR_ROLE,
        // Each organization has its own model budgets: who may create one is an instance setting (ORGANIZATION_CREATION).
        allowUserToCreateOrganization: (user) => organizationCreationAllowed(creationPolicy, user, creationLookups, new Date()),
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        // Only a confirmed account whose address is the invited one can accept (Better Auth checks the address too).
        requireEmailVerificationOnInvitation: true,
        // audit_log.organization_id is ON DELETE RESTRICT: an organization with history cannot be hard-deleted.
        disableOrganizationDeletion: true,
        sendInvitationEmail: emails.invitation,
        organizationHooks: organizationHooks(organizationCreationHooks(creationPolicy, creationLookups), createAuditHooks({ core, lookups }), emailReady),
      }),
      // TOTP with backup codes; enforcement for owners and admins is an organization setting (security settings).
      twoFactor({ issuer: env.platform.name }),
    ],
  });

  resolveSessionUser = async (headers) => (await auth.api.getSession({ headers }))?.user.id ?? null;
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
