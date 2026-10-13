import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../app-context.js';
import { buildMcpServer } from './server.js';

export const MCP_PATH = '/mcp';

const NOT_ALLOWED = { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this endpoint is stateless, POST only.' }, id: null };

/**
 * Streamable HTTP, stateless: a new server and transport per request, torn down when the response closes. API key
 * only (cookies are never read). Authentication, the per-key rate limit and every permission check happen before and
 * inside the use cases, exactly as on REST.
 */
export function registerMcpRoute(app: FastifyInstance, ctx: AppContext): void {
  app.post(MCP_PATH, async (request, reply) => {
    const actor = await ctx.resolveKeyActor(request);
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
    await ctx.resolveKeyActor(request);
    return reply.status(405).header('allow', 'POST').send(NOT_ALLOWED);
  };
  app.get(MCP_PATH, notAllowed);
  app.delete(MCP_PATH, notAllowed);
}
