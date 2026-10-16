import { request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHealthServer } from './health-server.js';
import { createWorkerMetrics } from './worker-metrics.js';

const TOKEN = 'metrics-token-metrics-token';

/** A raw request: the path is sent exactly as written, without the normalisation `fetch` applies. */
const send = (port: number, path: string, headers: Record<string, string> = {}): Promise<number> =>
  new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });

describe('health server routing', () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = await startHealthServer({
      port: 0,
      host: '127.0.0.1',
      checkDatabase: async () => undefined,
      isReady: () => true,
      metrics: createWorkerMetrics().registry,
      metricsToken: TOKEN,
      onError: () => undefined,
    });
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });
  afterAll(() => new Promise<void>((resolve) => void server.close(() => resolve())));

  it('asks for the token on /metrics whatever the query string, and never reads it from there', async () => {
    expect(await send(port, '/metrics?x=1')).toBe(401);
    expect(await send(port, `/metrics?token=${TOKEN}`)).toBe(401);
    expect(await send(port, `/metrics?authorization=Bearer%20${TOKEN}`)).toBe(401);
    expect(await send(port, '/metrics?x=1', { authorization: `Bearer ${TOKEN}` })).toBe(200);
  });

  it.each(['//metrics', '/metrics/', '/METRICS', '/health/../metrics', '/%6detrics', '/metrics%00', 'http://127.0.0.1/metrics', '/__proto__', '/constructor', '/'])(
    'serves nothing at %s, with or without the token',
    async (path) => {
      expect(await send(port, path)).toBe(404);
      expect(await send(port, path, { authorization: `Bearer ${TOKEN}` })).toBe(404);
    },
  );

  it('refuses tokens that are almost right', async () => {
    for (const authorization of [`Bearer  ${TOKEN}`, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}`, `Basic ${TOKEN}`, TOKEN, 'Bearer ']) {
      expect(await send(port, '/metrics', { authorization })).toBe(401);
    }
  });
});
