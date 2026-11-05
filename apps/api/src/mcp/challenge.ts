import { MCP_OAUTH_PROPOSE_MOVE_SCOPE, MCP_OAUTH_SCOPE } from '@candydati/domain';

export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';

/** Where the metadata of `resource` lives: the well-known segment inserted before its path (RFC 9728 §3.1). */
export function protectedResourceMetadataUrl(resource: string): string {
  const url = new URL(resource);
  return `${url.origin}${PROTECTED_RESOURCE_METADATA_PATH}${url.pathname.replace(/\/$/, '')}`;
}

/**
 * What a client is asked to request. The opt-in to propose moves is asked for too, so the consent page can offer it; it
 * stays unchecked there unless the person ticks it, and the token then carries only `mcp`.
 */
export const MCP_CHALLENGE_SCOPE = `${MCP_OAUTH_SCOPE} ${MCP_OAUTH_PROPOSE_MOVE_SCOPE}`;

/**
 * The `WWW-Authenticate` of a 401 on the MCP endpoint. With OAuth on, it names the protected resource metadata, from
 * which an MCP client (Claude) discovers the authorization server and starts the flow (MCP authorization, RFC 9728 §5.1).
 */
export function mcpChallenge(resource: string | null, why: 'missing' | 'invalid'): string {
  const parts = [
    ...(why === 'invalid' ? ['error="invalid_token"'] : []),
    ...(resource === null ? [] : [`resource_metadata="${protectedResourceMetadataUrl(resource)}"`, `scope="${MCP_CHALLENGE_SCOPE}"`]),
  ];
  return parts.length === 0 ? 'Bearer' : `Bearer ${parts.join(', ')}`;
}
