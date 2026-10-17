import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, schema, sql, type Db } from '@candydati/db';
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
  /** BOOTSTRAP_TOKEN, else in production the code derived from BETTER_AUTH_SECRET (first-owner-setup.ts); null when none. */
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
  /**
   * Records this account as the first owner, when it holds the live bootstrap claim and the instance still has no
   * confirmed account. False otherwise: a lapsed claim, or one another address took over. Serialised with the claims.
   */
  confirmBootstrapOwner(user: { readonly id: string; readonly email: string }, now: Date): Promise<boolean>;
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

/**
 * Whether an account in `invite_only` mode may confirm its address: the sign-up rule checked again, because a claim
 * can lapse or be taken over between the sign-up and the click on the link. An address with a pending invitation, or
 * the holder of the live bootstrap claim, which becomes the first owner of the instance.
 */
export async function verificationAllowed(policy: SignupPolicy, user: { readonly id: string; readonly email: string }, lookups: SignupLookups, now: Date): Promise<boolean> {
  if (policy.mode === 'open') return true;
  const email = normalizeEmail(user.email);
  if (await lookups.hasPendingInvitation(email, now)) return true;
  return lookups.confirmBootstrapOwner({ id: user.id, email }, now);
}

const table = schema.instanceBootstrap;
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];
const live = (claim: { readonly claimedAt: Date }, now: Date): boolean => now.getTime() - claim.claimedAt.getTime() < BOOTSTRAP_CLAIM_TTL_MS;
const confirmedAccountExists = async (db: Pick<Db, 'execute'>): Promise<boolean> => (await db.execute(sql`select 1 from "user" where email_verified = true limit 1`)).rows.length > 0;

/** The bootstrap is open while the instance has no confirmed account (the api then logs the first owner's setup link). */
export const bootstrapOpen = async (db: Db): Promise<boolean> => !(await confirmedAccountExists(db));

/** Takes the bootstrap lock for the transaction: `closed` once a confirmed account exists, else the claim (if any). */
const lockBootstrap = async (tx: Transaction): Promise<'closed' | typeof table.$inferSelect | null> => {
  await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
  if (await confirmedAccountExists(tx)) return 'closed';
  const [claim] = await tx.select().from(table).where(eq(table.slot, BOOTSTRAP_SLOT)).limit(1);
  return claim ?? null;
};

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
      const state = await lockBootstrap(tx);
      if (state === 'closed' || (state && state.email !== email && live(state, now))) return false;
      await tx.insert(table).values({ slot: BOOTSTRAP_SLOT, email, claimedAt: now }).onConflictDoUpdate({ target: table.slot, set: { email, claimedAt: now, ownerUserId: null } });
      return true;
    }),
  confirmBootstrapOwner: (user, now) =>
    db.transaction(async (tx) => {
      const state = await lockBootstrap(tx);
      if (state === 'closed' || !state || state.email !== user.email || state.ownerUserId !== null || !live(state, now)) return false;
      await tx.update(table).set({ ownerUserId: user.id }).where(eq(table.slot, BOOTSTRAP_SLOT));
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

/**
 * Better Auth's `emailVerification.beforeEmailVerification`: runs before the address is marked as confirmed, and a
 * refusal leaves the account unconfirmed (so without a session).
 */
/** The link's `callbackURL` when it is an in-app path (never another origin: no open redirect), else null. */
const inAppCallback = (request: Request | undefined): string | null => {
  const raw = request ? new URL(request.url).searchParams.get('callbackURL') : null;
  if (raw === null || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  return raw;
};

/**
 * Better Auth's `beforeEmailVerification`: a refused link goes back to its in-app callback with
 * `?error=SIGNUP_INVITE_ONLY`, like Better Auth does for an expired one, so the person lands on a page; without a
 * usable callback it is a plain 403.
 */
export const emailVerificationCheck = (policy: SignupPolicy, lookups: SignupLookups, now: () => Date = () => new Date()) =>
  async (user: { readonly id: string; readonly email: string }, request?: Request): Promise<void> => {
    if (await verificationAllowed(policy, user, lookups, now())) return;
    const callback = inAppCallback(request);
    if (callback !== null) {
      const separator = callback.includes('?') ? '&' : '?';
      throw new APIError('FOUND', undefined, new Headers({ location: `${callback}${separator}error=${SIGNUP_INVITE_ONLY}` }));
    }
    throw new APIError('FORBIDDEN', { code: SIGNUP_INVITE_ONLY, message: 'Accounts on this instance are created by invitation only.' });
  };
