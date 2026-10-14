import { createServer, type Server } from 'node:http';
import { isMetricsAuthorized, METRICS_CONTENT_TYPE, type MetricsRegistry } from '@tt/providers';

export interface HealthServerOptions {
  readonly port: number;
  readonly host: string;
  /** Resolves when the database (and so pg-boss) answers. */
  readonly checkDatabase: () => Promise<void>;
  /** False until the queues are registered, and again once shutdown starts. */
  readonly isReady: () => boolean;
  readonly metrics: MetricsRegistry;
  /** Unset: `/metrics` does not exist. */
  readonly metricsToken: string | null;
  readonly onError: (error: unknown) => void;
}

const json = (status: number, body: object): { status: number; type: string; body: string } => ({ status, type: 'application/json; charset=utf-8', body: JSON.stringify(body) });

type Answer = { status: number; type: string; body: string; headers?: Record<string, string> };

async function answer(path: string, authorization: string | undefined, options: HealthServerOptions): Promise<Answer> {
  if (path === '/health') return json(200, { status: 'ok' });
  if (path === '/ready') {
    if (!options.isReady()) return json(503, { status: 'not_ready', checks: { queues: 'fail' } });
    try {
      await options.checkDatabase();
      return json(200, { status: 'ready', checks: { database: 'ok', queues: 'ok' } });
    } catch (error) {
      options.onError(error);
      return json(503, { status: 'not_ready', checks: { database: 'fail' } });
    }
  }
  if (path === '/metrics' && options.metricsToken !== null) {
    if (!isMetricsAuthorized(authorization, options.metricsToken)) return { ...json(401, { error: 'metrics token required' }), headers: { 'www-authenticate': 'Bearer' } };
    return { status: 200, type: METRICS_CONTENT_TYPE, body: await options.metrics.render() };
  }
  return json(404, { error: 'not found' });
}

/**
 * The worker's only port: `/health` (the process answers: the compose healthcheck), `/ready` (queues registered and
 * database reachable) and, with METRICS_TOKEN, `/metrics`. Not published by docker compose: only the internal
 * network, or a scraper in the same network, reaches it. Answers GET only; nothing it serves depends on the request.
 */
export function startHealthServer(options: HealthServerOptions): Promise<Server> {
  const server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' }).end();
      return;
    }
    answer(path, request.headers.authorization, options).then(
      ({ status, type, body, headers }) => response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers }).end(body),
      (error: unknown) => {
        options.onError(error);
        response.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"internal"}');
      },
    );
  });
  server.requestTimeout = 5_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
