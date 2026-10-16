import { createInMemoryFileStorage, createInMemoryTaskQueue } from '@candydati/core/testing';
import { createDb } from '@candydati/db';
import { createErrorReporter, runWithRequestId, currentRequestId } from '@candydati/providers';
import { safeErrorSerializer } from '@candydati/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildServer } from './server.js';
import { createTestApp, testEnv, type TestApp } from './testing/test-app.js';
import { apiTestDatabaseUrl } from './testing/test-database.js';

const TOKEN = 'metrics-token-metrics-token';

describe('readiness', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('is ready when the database, the storage and (when there is one) the queue answer', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { status: 'ready', checks: { database: 'ok', storage: 'ok' } }, error: null });
  });

  it('answers 503 naming the failing check, without error details', async () => {
    const handle = createDb(apiTestDatabaseUrl(), 2);
    const files = createInMemoryFileStorage();
    vi.spyOn(files, 'get').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:9000'));
    const app = await buildServer({ env: testEnv(), db: handle.db, files, queue: createInMemoryTaskQueue(), checkQueue: () => Promise.reject(new Error('boss down')) });
    const response = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ success: false, data: { status: 'not_ready', checks: { database: 'ok', storage: 'fail', queue: 'fail' } }, error: { code: 'unavailable', message: 'Not ready.' } });
    expect(response.body).not.toContain('ECONNREFUSED');
    await app.close();
    await handle.close();
  });
});

describe('request id', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('keeps a well formed id sent by the caller and puts it in the response', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/health', headers: { 'x-request-id': 'web-0123456789' } });
    expect(response.headers['x-request-id']).toBe('web-0123456789');
  });

  it('replaces a malformed id (no free text into the logs) and generates one when there is none', async () => {
    const bad = await t.app.inject({ method: 'GET', url: '/api/health', headers: { 'x-request-id': 'bad id\twith spaces' } });
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const none = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(none.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(none.headers['x-request-id']).not.toBe(bad.headers['x-request-id']);
  });

  it('is the current request id of the handler, so the jobs it queues carry it', async () => {
    const handle = createDb(apiTestDatabaseUrl(), 2);
    const app = await buildServer({ env: testEnv(), db: handle.db, files: createInMemoryFileStorage(), queue: createInMemoryTaskQueue() });
    app.get('/whoami', async () => ({ id: currentRequestId() }));
    const response = await app.inject({ method: 'GET', url: '/whoami', headers: { 'x-request-id': 'web-0123456789' } });
    expect(response.json()).toEqual({ id: 'web-0123456789' });
    expect(runWithRequestId).toBeTypeOf('function');
    await app.close();
    await handle.close();
  });
});

describe('GET /metrics', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { METRICS_TOKEN: TOKEN } });
  });
  afterAll(async () => {
    await t.close();
  });

  it('does not exist without a token configured', async () => {
    const plain = await createTestApp();
    expect((await plain.app.inject({ method: 'GET', url: '/metrics', headers: { authorization: `Bearer ${TOKEN}` } })).statusCode).toBe(404);
    await plain.close();
  });

  it('refuses a missing or wrong token', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
  });

  it('serves Prometheus text with the HTTP series by route pattern, never by url', async () => {
    await t.app.inject({ method: 'GET', url: '/api/health' });
    await t.app.inject({ method: 'GET', url: '/api/v1/does-not-exist/abc123' });
    const response = await t.app.inject({ method: 'GET', url: '/metrics', headers: { authorization: `Bearer ${TOKEN}` } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('candydati_http_requests_total{method="GET",route="/api/health",status="200"}');
    expect(response.body).toContain('candydati_http_requests_total{method="GET",route="unmatched",status="404"}');
    expect(response.body).toContain('candydati_http_request_duration_seconds_bucket{method="GET",route="/api/health",status_class="2xx",le="0.1"}');
    expect(response.body).toContain('process_resident_memory_bytes');
    expect(response.body).not.toContain('abc123');
  });

  it('is not served through the /api prefix the web proxy forwards', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/metrics', headers: { authorization: `Bearer ${TOKEN}` } })).statusCode).toBe(404);
  });
});

describe('error reporting', () => {
  it('reports a server error without its message details, the request body, headers or personal data', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    const reporter = createErrorReporter({ dsn: 'https://pub@errors.example.org/9', service: 'api', fetch: fetchSpy, describe: safeErrorSerializer });
    const handle = createDb(apiTestDatabaseUrl(), 2);
    const app = await buildServer({ env: testEnv(), db: handle.db, files: createInMemoryFileStorage(), queue: createInMemoryTaskQueue(), errorReporter: reporter });
    app.post('/boom', async () => {
      throw Object.assign(new Error('cannot notify ada.lovelace@example.com'), { query: 'insert into candidate', params: ['Ada Lovelace'] });
    });
    const response = await app.inject({
      method: 'POST',
      url: '/boom?token=secret-query-token',
      headers: { 'x-request-id': 'web-0123456789', cookie: 'session=cookie-value', authorization: 'Bearer bearer-value-bearer-value-123' },
      payload: { fullName: 'Ada Lovelace', email: 'ada.lovelace@example.com' },
    });
    expect(response.statusCode).toBe(500);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    for (const leak of ['ada.lovelace', 'Ada Lovelace', 'secret-query-token', 'cookie-value', 'bearer-value', 'insert into candidate', 'fullName']) expect(body).not.toContain(leak);
    expect(body).toContain('"request_id":"web-0123456789"');
    expect(body).toContain('"route":"/boom"');
    await app.close();
    await handle.close();
  });

  it('does not report client errors', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}')));
    const reporter = createErrorReporter({ dsn: 'https://pub@errors.example.org/9', service: 'api', fetch: fetchSpy });
    const handle = createDb(apiTestDatabaseUrl(), 2);
    const app = await buildServer({ env: testEnv(), db: handle.db, files: createInMemoryFileStorage(), queue: createInMemoryTaskQueue(), errorReporter: reporter });
    await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { 'content-type': 'application/json' }, payload: '{not json' });
    expect(fetchSpy).not.toHaveBeenCalled();
    await app.close();
    await handle.close();
  });
});
