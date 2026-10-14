import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, schema, sql, type Db } from '@tt/db';
import { APIError } from 'better-auth/api';
import type { SignupMode } from '../config/env.js';
import { normalizeEmail } from './sign-in-throttle.js';

export const SIGNUP_PATH = '/sign-up/email';
/** Error code the web app translates: "registration is by invitation only". */
export const SIGNUP_INVITE_ONLY = 'SIGNUP_INVITE_ONLY';
/** Header that carries the one-time BOOTSTRAP_TOKEN on the first owner's sign-up (never a query: it would be logged). */
export const BOOTSTRAP_TOKEN_HEADER = 'x-bootstrap-token';
/** An unconfirmed bootstrap claim lapses with its verification link (24 hours), so a squatter cannot keep it. */
export const BOOTSTRAP_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
/** Constant key of the transaction advisory lock that serialises bootstrap claims across api instances. */
export const BOOTSTRAP_LOCK_KEY = 7_450_201_140;
const BOOTSTRAP_SLOT = 'first_owner';

export interface SignupPolicy {
  readonly mode: SignupMode;
  /** BOOTSTRAP_TOKEN from the environment, or null when unset. */
  readonly bootstrapToken: string | null;
  /** Production: the first owner's sign-up needs the token; without one configured nobody can bootstrap. */
  readonly requireBootstrapToken: boolean;
}

export interface SignupLookups {
  /** A pending, unexpired invitation to any organization for this address. */
  hasPendingInvitation(email: string, now: Date): Promise<boolean>;
  /**
   * Claims the single first-owner sign-up for this address. True while the instance has no confirmed account and no
   * other address holds a live claim. Serialised: of concurrent claims exactly one wins.
   */
  claimBootstrap(email: string, now: Date): Promise<boolean>;
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
const sameToken = (presented: string, expected: string): boolean => timingSafeEqual(digest(presented), digest(expected));

/** The token rule of the bootstrap: required when configured, and always in production. */
const bootstrapTokenAccepted = (policy: SignupPolicy, presented: string | null): boolean => {
  if (policy.bootstrapToken === null) return !policy.requireBootstrapToken;
  return presented !== null && sameToken(presented, policy.bootstrapToken);
};

/**
 * `open`: anyone. `invite_only`: an address with a pending invitation, or the first owner of an instance with no
 * confirmed account (bootstrap; documented in SECURITY.md), which in production needs the one-time BOOTSTRAP_TOKEN. The
 * answer never depends on whether the address already has an account, so it reveals nothing about registered emails.
 */
export async function signupAllowed(policy: SignupPolicy, email: string, presentedToken: string | null, lookups: SignupLookups, now: Date): Promise<boolean> {
  if (policy.mode === 'open') return true;
  const normalized = normalizeEmail(email);
  if (await lookups.hasPendingInvitation(normalized, now)) return true;
  if (!bootstrapTokenAccepted(policy, presentedToken)) return false;
  return lookups.claimBootstrap(normalized, now);
}

export const createSignupLookups = (db: Db): SignupLookups => ({
  async hasPendingInvitation(email, now) {
    const rows = await db
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(and(eq(sql`lower(${schema.invitation.email})`, email), eq(schema.invitation.status, 'pending'), gt(schema.invitation.expiresAt, now)))
      .limit(1);
    return rows.length > 0;
  },
  claimBootstrap: (email, now) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
      const confirmed = await tx.execute(sql`select 1 from "user" where email_verified = true limit 1`);
      if (confirmed.rows.length > 0) return false;
      const table = schema.instanceBootstrap;
      const [claim] = await tx.select().from(table).where(eq(table.slot, BOOTSTRAP_SLOT)).limit(1);
      if (claim && claim.email !== email && now.getTime() - claim.claimedAt.getTime() < BOOTSTRAP_CLAIM_TTL_MS) return false;
      await tx.insert(table).values({ slot: BOOTSTRAP_SLOT, email, claimedAt: now }).onConflictDoUpdate({ target: table.slot, set: { email, claimedAt: now } });
      return true;
    }),
});

/** A `hooks.before` step: refuses an email sign-up the policy does not allow, before anything is created. */
export const signupPolicyCheck = (policy: SignupPolicy, lookups: SignupLookups, now: () => Date = () => new Date()) =>
  async (ctx: { readonly path: string; readonly body?: unknown; readonly headers?: Headers | undefined }): Promise<void> => {
    if (ctx.path !== SIGNUP_PATH || policy.mode === 'open') return;
    const email: unknown = (ctx.body as { email?: unknown } | undefined)?.email;
    if (typeof email !== 'string') return; // Better Auth validates the body and answers 400
    const token = ctx.headers?.get(BOOTSTRAP_TOKEN_HEADER) ?? null;
    if (await signupAllowed(policy, email, token, lookups, now())) return;
    throw new APIError('FORBIDDEN', { code: SIGNUP_INVITE_ONLY, message: 'Accounts on this instance are created by invitation only.' });
  };
