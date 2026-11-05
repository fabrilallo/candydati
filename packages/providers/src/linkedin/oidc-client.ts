import type { LinkedInAuthorizationRequest, LinkedInCodeExchange, LinkedInIdentity } from '@candydati/core';
import { constantTimeEqual, type LinkedInClaims } from '@candydati/domain';
import { z } from 'zod';

/** Endpoints of LinkedIn's discovery document (https://www.linkedin.com/oauth/.well-known/openid-configuration). */
export const LINKEDIN_AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
export const LINKEDIN_ISSUER = 'https://www.linkedin.com';
/** "Sign In with LinkedIn using OpenID Connect": nothing more is asked. */
export const LINKEDIN_SCOPES = 'openid profile email';

const TIMEOUT_MS = 8000;
const ANSWER_MAX_CHARS = 32 * 1024;
const CLOCK_SKEW_SECONDS = 60;

export type LinkedInExchangeReason = 'unreachable' | 'token_refused' | 'token_invalid' | 'id_token_invalid' | 'userinfo_refused' | 'userinfo_invalid';

/** Why the exchange failed. The message is the reason only: never the code, a token or what LinkedIn answered. */
export class LinkedInExchangeError extends Error {
  constructor(readonly reason: LinkedInExchangeReason) {
    super(`linkedin: ${reason}`);
    this.name = 'LinkedInExchangeError';
  }
}

export interface LinkedInClientOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

const tokenSchema = z.object({ access_token: z.string().min(1).max(4096), id_token: z.string().min(1).max(8192) });

const idTokenClaimsSchema = z.object({
  iss: z.literal(LINKEDIN_ISSUER),
  aud: z.union([z.string(), z.array(z.string()).max(10)]),
  sub: z.string().min(1).max(256),
  exp: z.number(),
  nonce: z.string().max(512).optional(),
});

/** Only what the form may use, plus `sub` to tie the profile to the ID token. Photo, locale and the rest are never read. */
const userinfoSchema = z.object({
  sub: z.string().min(1).max(256),
  given_name: z.string().max(1000).nullish(),
  family_name: z.string().max(1000).nullish(),
  email: z.string().max(320).nullish(),
  email_verified: z.boolean().nullish().catch(null),
});

type Fail = (reason: LinkedInExchangeReason) => never;
const fail: Fail = (reason) => {
  throw new LinkedInExchangeError(reason);
};

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return fail('unreachable');
  }
}

/** The body as JSON, refusing what is too large or not JSON. */
async function readJson(response: Response, invalid: LinkedInExchangeReason): Promise<unknown> {
  const text = await response.text().catch(() => fail('unreachable'));
  if (text.length > ANSWER_MAX_CHARS) return fail(invalid);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail(invalid);
  }
}

function decodeJwtPayload(token: string): unknown {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return fail('id_token_invalid');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown;
  } catch {
    return fail('id_token_invalid');
  }
}

/**
 * The ID token came straight from LinkedIn's token endpoint over TLS, so its issuer is LinkedIn (OpenID Connect Core
 * 3.1.3.7, point 6): the signature is not checked, the audience, expiry and nonce are. Returns the member id.
 */
function checkIdToken(token: string, options: { clientId: string; nonce: string; now: Date }): string {
  const claims = idTokenClaimsSchema.safeParse(decodeJwtPayload(token));
  if (!claims.success) return fail('id_token_invalid');
  const audience = Array.isArray(claims.data.aud) ? claims.data.aud : [claims.data.aud];
  const expired = claims.data.exp + CLOCK_SKEW_SECONDS <= options.now.getTime() / 1000;
  const wrongNonce = claims.data.nonce !== undefined && !constantTimeEqual(claims.data.nonce, options.nonce);
  if (!audience.includes(options.clientId) || expired || wrongNonce) return fail('id_token_invalid');
  return claims.data.sub;
}

async function fetchToken(fetchImpl: typeof fetch, client: LinkedInClientOptions, exchange: LinkedInCodeExchange) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: exchange.code,
    redirect_uri: exchange.redirectUri,
    client_id: client.clientId,
    client_secret: client.clientSecret,
  });
  const response = await call(fetchImpl, LINKEDIN_TOKEN_URL, { method: 'POST', body, headers: { accept: 'application/json' } });
  if (!response.ok) return fail('token_refused');
  const token = tokenSchema.safeParse(await readJson(response, 'token_invalid'));
  return token.success ? token.data : fail('token_invalid');
}

async function fetchUserinfo(fetchImpl: typeof fetch, accessToken: string, memberId: string): Promise<LinkedInClaims> {
  const response = await call(fetchImpl, LINKEDIN_USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } });
  if (!response.ok) return fail('userinfo_refused');
  const info = userinfoSchema.safeParse(await readJson(response, 'userinfo_invalid'));
  if (!info.success || !constantTimeEqual(info.data.sub, memberId)) return fail('userinfo_invalid');
  return {
    givenName: info.data.given_name ?? null,
    familyName: info.data.family_name ?? null,
    email: info.data.email ?? null,
    emailVerified: info.data.email_verified === true,
  };
}

/**
 * Sign In with LinkedIn using OpenID Connect for a confidential web client: authorization code exchanged server side
 * with the client secret (LinkedIn offers PKCE to native apps only). Every answer is validated with Zod; the access token
 * lives only inside `claimsFor` and is never logged, stored or returned.
 */
export function createLinkedInIdentity(options: LinkedInClientOptions): LinkedInIdentity {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  return {
    authorizationUrl(request: LinkedInAuthorizationRequest): string {
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: options.clientId,
        redirect_uri: request.redirectUri,
        state: request.state,
        nonce: request.nonce,
        scope: LINKEDIN_SCOPES,
      });
      return `${LINKEDIN_AUTHORIZATION_URL}?${query.toString()}`;
    },
    async claimsFor(exchange: LinkedInCodeExchange): Promise<LinkedInClaims> {
      const token = await fetchToken(fetchImpl, options, exchange);
      const memberId = checkIdToken(token.id_token, { clientId: options.clientId, nonce: exchange.nonce, now: now() });
      return fetchUserinfo(fetchImpl, token.access_token, memberId);
    },
  };
}
