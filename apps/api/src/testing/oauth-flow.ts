import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { TestUser } from './client.js';
import { WEB_ORIGIN } from './test-app.js';

export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
export const MCP_RESOURCE = `${WEB_ORIGIN}/mcp`;

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

export const newPkce = (): Pkce => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

export interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly token_type: string;
  readonly scope: string;
}

/** Dynamic client registration as Claude does it: a public client with Claude's callback. */
export async function registerClient(app: FastifyInstance, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/oauth2/register',
    headers: { 'content-type': 'application/json' },
    payload: { client_name: 'Claude', redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...overrides },
  });
}

export async function registeredClientId(app: FastifyInstance): Promise<string> {
  const reply = await registerClient(app);
  if (reply.statusCode !== 201) throw new Error(`registration failed: ${reply.statusCode} ${reply.body}`);
  return (JSON.parse(reply.body) as { client_id: string }).client_id;
}

/** The browser opening the authorization URL with the person's session: Better Auth redirects to the consent page. */
export async function authorize(app: FastifyInstance, user: TestUser, clientId: string, pkce: Pkce, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CLAUDE_CALLBACK,
    scope: 'mcp offline_access',
    state: 'state-1',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    resource: MCP_RESOURCE,
    ...extra,
  });
  return app.inject({ method: 'GET', url: `/api/auth/oauth2/authorize?${query.toString()}`, headers: { accept: 'text/html', cookie: user.cookieHeader() } });
}

/** The signed query of the consent page the authorization redirected to. */
export function consentQueryOf(location: unknown): string {
  if (typeof location !== 'string' || !location.includes('/oauth/consent?')) throw new Error(`not a consent redirect: ${String(location)}`);
  return location.slice(location.indexOf('?') + 1);
}

/** The consent page's answer, as the web app posts it. Returns the redirect URL Better Auth hands back. */
export async function consent(user: TestUser, oauthQuery: string, accept = true) {
  return user.post<never>('/api/auth/oauth2/consent', { accept, oauth_query: oauthQuery });
}

async function consentedUrl(user: TestUser, oauthQuery: string): Promise<string> {
  const answered = await consent(user, oauthQuery);
  const url = (answered.body as unknown as { url?: string } | null)?.url;
  if (!url) throw new Error(`consent failed: ${answered.status} ${JSON.stringify(answered.body)}`);
  return url;
}

export const codeOf =(url: string): string | null => new URL(url).searchParams.get('code');

/** The MCP client's server exchanging a code or a refresh token, form-encoded as RFC 6749 says. */
export async function token(app: FastifyInstance, params: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/oauth2/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(params).toString(),
  });
}

/** The whole flow for `user` with the active organization they have: a token pair. */
export async function connect(app: FastifyInstance, user: TestUser, clientId?: string): Promise<TokenResponse & { readonly clientId: string }> {
  const id = clientId ?? (await registeredClientId(app));
  const pkce = newPkce();
  const authorized = await authorize(app, user, id, pkce);
  const location = String(authorized.headers.location ?? '');
  // An app already connected to this organization goes straight back to its callback (no consent page again).
  const url = location.startsWith(`${CLAUDE_CALLBACK}?`) ? location : await consentedUrl(user, consentQueryOf(location));
  const code = url ? codeOf(url) : null;
  if (!code) throw new Error(`no code: ${url}`);
  const exchanged = await token(app, { grant_type: 'authorization_code', code, redirect_uri: CLAUDE_CALLBACK, client_id: id, code_verifier: pkce.verifier, resource: MCP_RESOURCE });
  if (exchanged.statusCode !== 200) throw new Error(`token failed: ${exchanged.statusCode} ${exchanged.body}`);
  return { ...(JSON.parse(exchanged.body) as TokenResponse), clientId: id };
}
