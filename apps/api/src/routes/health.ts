import { fail, ok } from '@candydati/domain';
import { isMetricsAuthorized, METRICS_CONTENT_TYPE } from '@candydati/providers';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import type { ApiMetrics } from '../observability/api-metrics.js';
import { runReadiness, type ReadinessChecks } from '../observability/readiness.js';

/** An object that does not exist: asking for it proves the storage answers without reading or writing anything real. */
const STORAGE_PROBE_KEY = 'health/readiness-probe';

export interface HealthDeps {
  readonly metrics: ApiMetrics;
  /** The queue check, when there is a queue (pg-boss). */
  readonly checkQueue?: (() => Promise<void>) | undefined;
}

/**
 * `/api/health`: liveness, the process answers and the database is reachable (kept as it was: the container healthchecks use it).
 * `/api/ready`: readiness, database, object storage and queue each checked with a timeout; 503 when any fails.
 * `/metrics`: Prometheus, only when METRICS_TOKEN is set and the request carries it. Not under `/api`, so the web proxy never forwards it.
 */
export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext, deps: HealthDeps): void {
  app.get('/api/health', async (request, reply) => {
    try {
      await ctx.checkDatabase();
    } catch (error) {
      request.log.error({ err: error }, 'health check: database unreachable');
      return reply.status(503).send(fail('unavailable', 'Database unreachable.'));
    }
    return ok({ status: 'ok' as const });
  });

  const checks: ReadinessChecks = {
    database: () => ctx.checkDatabase(),
    storage: () => ctx.checkStorage(STORAGE_PROBE_KEY),
    queue: deps.checkQueue,
  };
  app.get('/api/ready', async (request, reply) => {
    const report = await runReadiness(checks);
    for (const failure of report.failures) request.log.error({ err: failure.error, check: failure.check }, 'readiness check failed');
    if (report.ready) return ok({ status: 'ready' as const, checks: report.checks });
    return reply.status(503).send({ ...fail('unavailable', 'Not ready.'), data: { status: 'not_ready', checks: report.checks } });
  });

  const token = ctx.env.observability.metricsToken;
  if (token !== null) {
    app.get('/metrics', async (request, reply) => {
      if (!isMetricsAuthorized(request.headers.authorization, token)) {
        return reply.status(401).header('www-authenticate', 'Bearer').send(fail('unauthorized', 'Metrics token required.'));
      }
      return reply.type(METRICS_CONTENT_TYPE).send(await deps.metrics.registry.render());
    });
  }
}
