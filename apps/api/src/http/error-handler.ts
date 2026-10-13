import { fail } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import { issuesOf } from './error-issues.js';
import { toHttpFailure } from './errors.js';

/**
 * One place that turns anything thrown into the envelope. Unknown errors are logged, never leaked.
 * `error.issues` is added only when a use case reported structured validation issues.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const failure = toHttpFailure(error);
    if (failure.log) request.log.error({ err: error }, 'request failed');
    const body = fail(failure.code, failure.message);
    const issues = issuesOf(error);
    const payload = issues.length > 0 ? { ...body, error: { ...body.error, issues } } : body;
    return reply.status(failure.status).send(payload);
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send(fail('not_found', 'Not found.')));
}
