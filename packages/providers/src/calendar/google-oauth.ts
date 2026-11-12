import { createHash } from 'node:crypto';
import type { GoogleAuthorizationRequest, GoogleCalendarAuth, GoogleCodeExchange, GoogleGrant } from '@candydati/core';
import { GOOGLE_CALENDAR_REQUIRED_SCOPES, GOOGLE_IDENTITY_SCOPES } from '@candydati/domain';
import { z } from 'zod';

/** Endpoints of Google's discovery document (https://accounts.google.com/.well-known/openid-configuration). */
export const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_CALENDAR_SCOPE = [...GOOGLE_IDENTITY_SCOPES, ...GOOGLE_CALENDAR_REQUIRED_SCOPES].join(' ');

const TIMEOUT_MS = 8000;
const ANSWER_MAX_CHARS = 32 * 1024;
const CLOCK_SKEW_SECONDS = 60;

export type GoogleOAuthReason = 'unreachable' | 'token_refused' | 'token_invalid' | 'no_refresh_token' | 'id_token_invalid' | 'revoke_refused';

/** Why a call to Google failed. The message is the reason only: never the code, a token or what Google answered. */
export class GoogleOAuthError extends Error {
  constructor(readonly reason: GoogleOAuthReason) {
    super(`google: ${reason}`);
    this.name = 'GoogleOAuthError';
  }
}

export interface GoogleOAuthOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

const tokenSchema = z.object({
  access_token: z.string().min(1).max(4096),
  refresh_token: z.string().min(1).max(4096).optional(),
  scope: z.string().max(4096),
  id_token: z.string().min(1).max(8192),
});

const idTokenClaimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string()).max(10)]),
  exp: z.number(),
  email: z.string().min(3).max(320),
  email_verified: z.boolean(),
});

const fail = (reason: GoogleOAuthReason): never => {
  throw new GoogleOAuthError(reason);
};

async function call(fetchImpl: typeof fetch, url: string, body: URLSearchParams): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: 'POST',
      body,
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return fail('unreachable');
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => fail('unreachable'));
  if (text.length > ANSWER_MAX_CHARS) return fail('token_invalid');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail('token_invalid');
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
 * The ID token came straight from Google's token endpoint over TLS, so its issuer is Google (OpenID Connect Core
 * 3.1.3.7, point 6): the signature is not checked; issuer, audience and expiry are. Returns the verified address.
 */
function emailOf(token: string, options: { clientId: string; now: Date }): string {
  const claims = idTokenClaimsSchema.safeParse(decodeJwtPayload(token));
  if (!claims.success) return fail('id_token_invalid');
  const audience = Array.isArray(claims.data.aud) ? claims.data.aud : [claims.data.aud];
  const expired = claims.data.exp + CLOCK_SKEW_SECONDS <= options.now.getTime() / 1000;
  if (!GOOGLE_ISSUERS.includes(claims.data.iss) || !audience.includes(options.clientId) || expired || !claims.data.email_verified) return fail('id_token_invalid');
  return claims.data.email.toLowerCase();
}

/** PKCE S256 (RFC 7636 §4.2): base64url of the SHA-256 of the verifier. */
export const pkceChallengeOf = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

/**
 * The instance's Google app as a confidential web client: authorization code with PKCE, exchanged server side with the
 * client secret; offline access with a consent screen every time, so Google always sends a refresh token. Every answer
 * is validated with Zod; the access token is dropped at once and nothing is ever logged.
 */
export function createGoogleCalendarAuth(options: GoogleOAuthOptions): GoogleCalendarAuth {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  return {
    authorizationUrl(request: GoogleAuthorizationRequest): string {
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: options.clientId,
        redirect_uri: request.redirectUri,
        scope: GOOGLE_CALENDAR_SCOPE,
        state: request.state,
        code_challenge: pkceChallengeOf(request.codeVerifier),
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      });
      return `${GOOGLE_AUTHORIZATION_URL}?${query.toString()}`;
    },
    async exchange(request: GoogleCodeExchange): Promise<GoogleGrant> {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: request.code,
        code_verifier: request.codeVerifier,
        redirect_uri: request.redirectUri,
        client_id: options.clientId,
        client_secret: options.clientSecret,
      });
      const response = await call(fetchImpl, GOOGLE_TOKEN_URL, body);
      if (!response.ok) return fail('token_refused');
      const token = tokenSchema.safeParse(await readJson(response));
      if (!token.success) return fail('token_invalid');
      if (token.data.refresh_token === undefined) return fail('no_refresh_token');
      return { refreshToken: token.data.refresh_token, accountEmail: emailOf(token.data.id_token, { clientId: options.clientId, now: now() }), scopes: token.data.scope };
    },
    async revoke(refreshToken: string): Promise<void> {
      const response = await call(fetchImpl, GOOGLE_REVOKE_URL, new URLSearchParams({ token: refreshToken }));
      // 400 invalid_token: Google already forgot it, which is what was asked.
      if (!response.ok && response.status !== 400) fail('revoke_refused');
    },
  };
}
