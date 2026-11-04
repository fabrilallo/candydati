import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { DelegatedActor } from '@candydati/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { hasBearer } from '../http/bearer.js';
import { UnauthenticatedError } from '../http/errors.js';
import { mcpRequestCost } from './batch.js';
import { mcpChallenge } from './challenge.js';
import { buildMcpServer } from './server.js';

export const MCP_PATH = '/mcp';

const NOT_ALLOWED = { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this endpoint is stateless, POST only.' }, id: null };

/**
 * An API key or an OAuth access token of a connected app. A refusal is a 401 whose `WWW-Authenticate` names the
 * protected resource metadata, so an MCP client (Claude) can discover the authorization server and sign the person in.
 */
async function mcpActor(ctx: AppContext, request: FastifyRequest, reply: FastifyReply, cost?: number): Promise<DelegatedActor> {
  try {
    return await ctx.resolveMcpActor(request, cost);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      const resource = ctx.mcpOAuth.enabled ? ctx.mcpOAuth.resource : null;
      reply.header('www-authenticate', mcpChallenge(resource, hasBearer(request.headers) ? 'invalid' : 'missing'));
    }
    throw error;
  }
}

/**
 * Streamable HTTP, stateless: a new server and transport per request, torn down when the response closes. Bearer only
 * (cookies are never read). Authentication, the per-credential rate limit (one unit per tool call, batches capped at
 * MCP_MAX_BATCH) and every permission check happen before and inside the use cases, exactly as on REST.
 */
export function registerMcpRoute(app: FastifyInstance, ctx: AppContext): void {
  app.post(MCP_PATH, async (request, reply) => {
    const verdict = mcpRequestCost(request.body);
    if (!verdict.ok) return reply.status(verdict.status).send(verdict.body);
    // Every tool call of a batch counts against the credential's rate limit.
    const actor = await mcpActor(ctx, request, reply, verdict.cost);
    const server = buildMcpServer(ctx.env.platform.name, { app: ctx, actor }, (error, tool) =>
      request.log.error({ err: error, tool }, 'mcp tool failed'),
    );
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport as Parameters<typeof server.connect>[0]);
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  const notAllowed = async (request: FastifyRequest, reply: FastifyReply) => {
    await mcpActor(ctx, request, reply);
    return reply.status(405).header('allow', 'POST').send(NOT_ALLOWED);
  };
  app.get(MCP_PATH, notAllowed);
  app.delete(MCP_PATH, notAllowed);
}
