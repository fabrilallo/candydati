import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Auth } from './create-auth.js';
import { toWebRequest } from './fastify-auth.js';
import { AUTHORIZATION_SERVER_PATHS, PROTECTED_RESOURCE_PATHS } from './oauth-paths.js';

async function send(response: Response, reply: FastifyReply): Promise<FastifyReply> {
  reply.status(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  return reply.send(response.body ? await response.text() : null);
}

/**
 * OAuth discovery for MCP clients, registered only while OAuth is on. The protected resource metadata is served by the
 * MCP plugin itself (its request hook answers these paths); the authorization server metadata by the provider's own
 * helper, at the RFC 8414 path-inserted location of the issuer `{origin}/api/auth` and at the root.
 */
export function registerOAuthDiscoveryRoutes(app: FastifyInstance, auth: Auth): void {
  const serverMetadata = oauthProviderAuthServerMetadata(auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0]);
  for (const url of PROTECTED_RESOURCE_PATHS) {
    app.route({ method: 'GET', url, handler: async (request, reply) => send(await auth.handler(toWebRequest(request)), reply) });
  }
  for (const url of AUTHORIZATION_SERVER_PATHS) {
    app.route({ method: 'GET', url, handler: async (request, reply) => send(await serverMetadata(toWebRequest(request)), reply) });
  }
}
