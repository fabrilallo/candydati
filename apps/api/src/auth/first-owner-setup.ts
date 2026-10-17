import { createHmac } from 'node:crypto';
import type { Env } from '../config/env.js';

/** Domain separation: the setup code is never equal to anything else derived from BETTER_AUTH_SECRET. */
const SETUP_CODE_CONTEXT = 'candydati:first-owner-setup:v1';

type SetupEnv = Pick<Env, 'NODE_ENV' | 'SIGNUP_MODE' | 'BETTER_AUTH_SECRET' | 'BOOTSTRAP_TOKEN'> & { readonly platform: Pick<Env['platform'], 'url'> };

/**
 * The first owner's setup code when the operator set no BOOTSTRAP_TOKEN: an HMAC of BETTER_AUTH_SECRET, so it is the
 * same at every restart, needs no storage and reveals nothing about the secret. Like BOOTSTRAP_TOKEN it opens only the
 * bootstrap, which closes for good once an account is confirmed (signup-policy.ts).
 */
export const deriveSetupCode = (secret: string): string => createHmac('sha256', secret).update(SETUP_CODE_CONTEXT).digest('base64url');

/** The token the bootstrap asks for: the operator's BOOTSTRAP_TOKEN, else the derived code in production, else none. */
export const bootstrapTokenFor = (env: SetupEnv): string | null =>
  env.BOOTSTRAP_TOKEN ?? (env.NODE_ENV === 'production' ? deriveSetupCode(env.BETTER_AUTH_SECRET) : null);

/**
 * The line the api logs at start while a production `invite_only` instance has no confirmed account: whoever reads the
 * server's logs is the operator. The derived code goes in the URL fragment, which browsers never send, so no proxy or
 * access log records it; a BOOTSTRAP_TOKEN chosen by the operator is never printed.
 */
export const firstOwnerSetupNotice = (env: SetupEnv, bootstrapOpen: boolean): string | null => {
  if (!bootstrapOpen || env.SIGNUP_MODE !== 'invite_only' || env.NODE_ENV !== 'production') return null;
  const link = `${env.platform.url.replace(/\/+$/, '')}/signup?setup`;
  // The page has no field for the code: it comes in the link. The operator's own token is never printed.
  if (env.BOOTSTRAP_TOKEN !== undefined) return `First owner setup: open ${link}#code=<BOOTSTRAP_TOKEN>`;
  return `First owner setup: open ${link}#code=${deriveSetupCode(env.BETTER_AUTH_SECRET)}`;
};
