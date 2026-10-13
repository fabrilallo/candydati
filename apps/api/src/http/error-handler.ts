import { fail } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import { toHttpFailure } from './errors.js';

/** One place that turns anything thrown into the envelope. Unknown errors are logged, never leaked. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const failure = toHttpFailure(error);
    if (failure.log) request.log.error({ err: error }, 'request failed');
    return reply.status(failure.status).send(fail(failure.code, failure.message));
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send(fail('not_found', 'Not found.')));
}
