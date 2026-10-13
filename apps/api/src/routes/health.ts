import { fail, ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/health', async (request, reply) => {
    try {
      await ctx.checkDatabase();
    } catch (error) {
      request.log.error({ err: error }, 'health check: database unreachable');
      return reply.status(503).send(fail('unavailable', 'Database unreachable.'));
    }
    return ok({ status: 'ok' as const });
  });
}
