import { and, eq, gt, schema, sql, type Db } from '@tt/db';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { SignupMode } from '../config/env.js';
import { normalizeEmail } from './sign-in-throttle.js';

export const SIGNUP_PATH = '/sign-up/email';
/** Error code the web app translates: "registration is by invitation only". */
export const SIGNUP_INVITE_ONLY = 'SIGNUP_INVITE_ONLY';

export interface SignupLookups {
  /** True once any account exists: the first account of an instance (its first owner) may always be created. */
  hasAnyUser(): Promise<boolean>;
  /** A pending, unexpired invitation to any organization for this address. */
  hasPendingInvitation(email: string, now: Date): Promise<boolean>;
}

/**
 * `open`: anyone. `invite_only`: an address with a pending invitation, or the very first account of the instance
 * (bootstrap of the first owner; documented in SECURITY.md). The answer never depends on whether the address already
 * has an account, so it reveals nothing about registered emails.
 */
export async function signupAllowed(mode: SignupMode, email: string, lookups: SignupLookups, now: Date): Promise<boolean> {
  if (mode === 'open') return true;
  if (await lookups.hasPendingInvitation(normalizeEmail(email), now)) return true;
  return !(await lookups.hasAnyUser());
}

export const createSignupLookups = (db: Db): SignupLookups => ({
  async hasAnyUser() {
    const { rows } = await db.execute(sql`select 1 from "user" limit 1`);
    return rows.length > 0;
  },
  async hasPendingInvitation(email, now) {
    const rows = await db
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(and(eq(sql`lower(${schema.invitation.email})`, email), eq(schema.invitation.status, 'pending'), gt(schema.invitation.expiresAt, now)))
      .limit(1);
    return rows.length > 0;
  },
});

/** Better Auth `hooks.before`: refuses an email sign-up the mode does not allow, before anything is created. */
export const signupPolicyHook = (mode: SignupMode, lookups: SignupLookups, now: () => Date = () => new Date()) =>
  createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SIGNUP_PATH || mode === 'open') return;
    const email: unknown = (ctx.body as { email?: unknown } | undefined)?.email;
    if (typeof email !== 'string') return; // Better Auth validates the body and answers 400
    if (await signupAllowed(mode, email, lookups, now())) return;
    throw new APIError('FORBIDDEN', { code: SIGNUP_INVITE_ONLY, message: 'Accounts on this instance are created by invitation only.' });
  });
