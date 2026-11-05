import { constantTimeEqual, linkedInReturnPathOf, toLinkedInPrefill, type LinkedInPrefillResult } from '@candydati/domain';
import { z } from 'zod';
import { ValidationError } from '../../errors.js';
import type { LinkedInAccount, LinkedInPrefillDeps } from '../../linkedin-prefill-ports.js';

/**
 * "Fill in with LinkedIn" on the public application form. No actor, no organization, nothing stored and so no audit
 * entry: the candidate has no account and nothing exists until they send the form. The adapter keeps the pending login
 * in an encrypted cookie of the candidate's browser and gives the prefill to the form once.
 */

/** What the browser keeps between the start and LinkedIn's callback (encrypted, 10 minutes). */
export interface PendingLinkedInLogin {
  readonly state: string;
  readonly nonce: string;
  readonly returnPath: string;
}

export interface StartedLinkedInLogin {
  readonly location: string;
  readonly pending: PendingLinkedInLogin;
}

/** Why a callback did not fill the form. Codes only: never personal data. */
export interface LinkedInPrefillProblem {
  readonly reason: 'state_mismatch' | 'linkedin_error' | 'invalid_query' | 'exchange_failed';
  /** LinkedIn's error code (a fixed vocabulary), when it sent one. */
  readonly detail?: string;
  readonly error?: unknown;
}

export interface CompletedLinkedInLogin {
  /** The job page to go back to; null when neither the cookie nor the state name one. */
  readonly returnPath: string | null;
  readonly result: LinkedInPrefillResult;
  readonly problem?: LinkedInPrefillProblem;
}

const CANCELLED = new Set(['user_cancelled_login', 'user_cancelled_authorize']);
const STATE_MAX = 512;

const callbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(STATE_MAX).optional(),
  error: z.string().min(1).max(100).regex(/^[a-z_]+$/).optional(),
});

/** The return path rides in the state too, so a lost cookie still lands on the job page (validated again, never trusted). */
const returnPathOfState = (state: unknown): string | null => {
  if (typeof state !== 'string' || state.length > STATE_MAX) return null;
  const encoded = state.slice(state.indexOf('.') + 1);
  return state.includes('.') ? linkedInReturnPathOf(Buffer.from(encoded, 'base64url').toString('utf8')) : null;
};

const stateOfQuery = (query: unknown): unknown => (typeof query === 'object' && query !== null ? (query as { state?: unknown }).state : undefined);

export function beginLinkedInPrefill(deps: LinkedInPrefillDeps, input: { readonly returnPath: unknown; readonly redirectUri: string }): StartedLinkedInLogin {
  const returnPath = linkedInReturnPathOf(input.returnPath);
  if (returnPath === null) throw new ValidationError([{ path: 'return', message: 'not_a_job_page' }]);
  const state = `${deps.randomToken()}.${Buffer.from(returnPath, 'utf8').toString('base64url')}`;
  const pending: PendingLinkedInLogin = { state, nonce: deps.randomToken(), returnPath };
  return { location: deps.identity.authorizationUrl({ state, nonce: pending.nonce, redirectUri: input.redirectUri }), pending };
}

const failed = (returnPath: string | null, problem: LinkedInPrefillProblem): CompletedLinkedInLogin => ({ returnPath, result: { status: 'failed' }, problem });

async function exchange(identity: LinkedInAccount, returnPath: string, input: { code: string; nonce: string; redirectUri: string }): Promise<CompletedLinkedInLogin> {
  try {
    const claims = await identity.claimsFor(input);
    return { returnPath, result: { status: 'filled', prefill: toLinkedInPrefill(claims) } };
  } catch (error) {
    return failed(returnPath, { reason: 'exchange_failed', error });
  }
}

export async function completeLinkedInPrefill(
  deps: Pick<LinkedInPrefillDeps, 'identity'>,
  input: { readonly query: unknown; readonly pending: PendingLinkedInLogin | null; readonly redirectUri: string },
): Promise<CompletedLinkedInLogin> {
  const { pending } = input;
  const returnPath = pending?.returnPath ?? returnPathOfState(stateOfQuery(input.query));
  const parsed = callbackQuerySchema.safeParse(input.query);
  if (!parsed.success) return failed(returnPath, { reason: 'invalid_query' });
  const { code, state, error } = parsed.data;
  if (pending === null || state === undefined || !constantTimeEqual(state, pending.state)) return failed(returnPath, { reason: 'state_mismatch' });
  if (error !== undefined) {
    return CANCELLED.has(error) ? { returnPath: pending.returnPath, result: { status: 'cancelled' } } : failed(pending.returnPath, { reason: 'linkedin_error', detail: error });
  }
  if (code === undefined) return failed(pending.returnPath, { reason: 'invalid_query' });
  return exchange(deps.identity, pending.returnPath, { code, nonce: pending.nonce, redirectUri: input.redirectUri });
}
