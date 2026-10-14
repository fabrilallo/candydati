import { acceptRequestId, REQUEST_ID_HEADER } from '@tt/domain';
import { runWithRequestId } from '@tt/providers';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ApiMetrics } from './api-metrics.js';

/** The request id of a request that came in: the caller's when it is well formed (the web proxy sends one), a new one otherwise. */
export const generateRequestId = (request: { headers: Record<string, unknown> }): string => acceptRequestId(request.headers[REQUEST_ID_HEADER]);

/** The route pattern (`/api/v1/jobs/:id`), never the url: the url has ids and tokens and would make a series per request. */
export const routeLabel = (request: FastifyRequest): string => {
  const pattern = request.routeOptions?.url;
  return pattern === undefined || pattern === '*' || pattern === '' ? 'unmatched' : pattern;
};

/**
 * Every request gets an id (`reqId` in the logs, `x-request-id` in the response) that is also the current request id
 * of everything it queues, and is counted and timed by route pattern and status.
 */
export function registerRequestObservability(app: FastifyInstance, metrics: ApiMetrics): void {
  app.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    runWithRequestId(request.id, done);
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = routeLabel(request);
    const status = reply.statusCode;
    metrics.httpRequests.inc({ method: request.method, route, status: String(status) });
    metrics.httpDuration.observe({ method: request.method, route, status_class: `${Math.floor(status / 100)}xx` }, reply.elapsedTime / 1000);
  });
}
