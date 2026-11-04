import type { Env } from '../config/env.js';

/** The OAuth callbacks of Claude's custom connectors (claude.ai, Claude desktop and mobile go through them). */
export const CLAUDE_REDIRECT_URIS: readonly string[] = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

const parse = (value: string): URL | null => (URL.canParse(value) ? new URL(value) : null);

/** The canonical MCP resource (RFC 8707 / RFC 9728): `{web origin}/mcp`, when the origin can serve OAuth (https or loopback). */
export function mcpResourceOf(webOrigin: string): string | null {
  const url = parse(webOrigin);
  if (!url) return null;
  const eligible = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  return eligible ? `${url.origin}/mcp` : null;
}

/** RFC 8252 loopback callback of a native client: plain http on a loopback host, any port and path, nothing else. */
const isLoopbackCallback = (uri: string): boolean => {
  const url = parse(uri);
  return url !== null && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && url.username === '' && url.password === '' && !uri.includes('#');
};

export interface RedirectPolicyOptions {
  /** Exact URIs the operator trusts besides Claude's. */
  readonly extra: readonly string[];
  readonly allowLoopback: boolean;
}

/**
 * Which OAuth callbacks an MCP client may register and use. Exact string match (RFC 9700 §2.1): no prefix, no wildcard,
 * no extra query. Registration is open (MCP clients register themselves), so this list is what keeps a stranger's app
 * from receiving a code: a phishing "Claude" registered with its own callback is refused before anyone sees it.
 */
export function createRedirectPolicy({ extra, allowLoopback }: RedirectPolicyOptions): (uri: string) => boolean {
  const exact: ReadonlySet<string> = new Set([...CLAUDE_REDIRECT_URIS, ...extra]);
  return (uri) => exact.has(uri) || (allowLoopback && isLoopbackCallback(uri));
}

export interface McpOAuthSettings {
  readonly enabled: boolean;
  /** Null when OAuth cannot be served (off, or the origin is neither https nor loopback). */
  readonly resource: string | null;
  readonly allowsRedirect: (uri: string) => boolean;
}

type SettingsEnv = Pick<Env, 'MCP_OAUTH_ENABLED' | 'BETTER_AUTH_URL' | 'MCP_OAUTH_REDIRECT_URIS' | 'MCP_OAUTH_ALLOW_LOOPBACK_REDIRECTS'>;

export function mcpOAuthSettings(env: SettingsEnv): McpOAuthSettings {
  const resource = mcpResourceOf(env.BETTER_AUTH_URL);
  return {
    enabled: env.MCP_OAUTH_ENABLED && resource !== null,
    resource,
    allowsRedirect: createRedirectPolicy({ extra: env.MCP_OAUTH_REDIRECT_URIS, allowLoopback: env.MCP_OAUTH_ALLOW_LOOPBACK_REDIRECTS }),
  };
}
