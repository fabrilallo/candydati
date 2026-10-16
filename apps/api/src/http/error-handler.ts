import { fail } from '@candydati/domain';
import type { ErrorReporter } from '@candydati/providers';
import type { FastifyInstance } from 'fastify';
import { issuesOf } from './error-issues.js';
import { toHttpFailure } from './errors.js';

/**
 * One place that turns anything thrown into the envelope. Unknown errors are logged (and sent to the error reporter,
 * when one is configured), never leaked.
 * `error.issues` is added only when a use case reported structured validation issues.
 */
export function registerErrorHandler(app: FastifyInstance, reporter?: ErrorReporter): void {
  app.setErrorHandler((error, request, reply) => {
    const failure = toHttpFailure(error);
    if (failure.log) {
      request.log.error({ err: error }, 'request failed');
      reporter?.capture(error, { request_id: request.id, route: request.routeOptions?.url });
    }
    const body = fail(failure.code, failure.message);
    const issues = issuesOf(error);
    const payload = issues.length > 0 ? { ...body, error: { ...body.error, issues } } : body;
    return reply.status(failure.status).send(payload);
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send(fail('not_found', 'Not found.')));
}
