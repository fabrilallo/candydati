import { normalizeEmail } from './sign-in-throttle.js';
import { BOOTSTRAP_TOKEN_HEADER, bootstrapTokenAccepted, SIGNUP_PATH, type SignupLookups, type SignupPolicy } from './signup-policy.js';

/** The part of Better Auth's endpoint context these hooks read (null outside a request). */
interface HookContext {
  readonly path?: string;
  readonly headers?: Headers | undefined;
  readonly context?: { readonly internalAdapter: { updateUser(id: string, data: { emailVerified: boolean }): Promise<unknown> } };
}
interface CreatedUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

/**
 * The first owner's sign-up through the setup link confirms the address at once: the setup code (BOOTSTRAP_TOKEN or
 * the code derived from BETTER_AUTH_SECRET) already proves this is the operator, and the instance may have no email
 * provider yet, which the owner configures from the app. Only with a configured code, only for the address that holds
 * the live claim; everyone else still confirms by email. If recording the owner fails (the claim changed in between),
 * the address goes back to unconfirmed, so nobody passes the bootstrap without being its owner.
 */
export const firstOwnerDatabaseHooks = (policy: SignupPolicy, lookups: SignupLookups, now: () => Date = () => new Date()) => ({
  user: {
    create: {
      before: async (user: { readonly email: string }, ctx: HookContext | null | undefined) => {
        if (ctx?.path !== SIGNUP_PATH || policy.mode === 'open' || policy.bootstrapToken === null) return undefined;
        if (!bootstrapTokenAccepted(policy, ctx.headers?.get(BOOTSTRAP_TOKEN_HEADER) ?? null)) return undefined;
        if (!(await lookups.holdsBootstrapClaim(normalizeEmail(user.email), now()))) return undefined;
        return { data: { emailVerified: true } };
      },
      after: async (user: CreatedUser, ctx: HookContext | null | undefined) => {
        if (!user.emailVerified || ctx?.path !== SIGNUP_PATH) return;
        if (await lookups.confirmBootstrapOwner({ id: user.id, email: normalizeEmail(user.email) }, now())) return;
        await ctx.context?.internalAdapter.updateUser(user.id, { emailVerified: false });
      },
    },
  },
});
