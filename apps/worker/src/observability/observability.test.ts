import { createErrorReporter, currentRequestId, withRequestId } from '@candydati/providers';
import type { BindableTaskQueue } from '@candydati/core';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineQueue } from '../queues/definitions.js';
import { startWorker, type WorkerBoss, type WorkerJob } from '../worker.js';
import { registerBacklogMetrics, type SqlReader } from './backlog-metrics.js';
import { startHealthServer } from './health-server.js';
import { createWorkerMetrics } from './worker-metrics.js';

type WorkHandler = Parameters<WorkerBoss['work']>[1];
const silent = pino({ level: 'silent' });

const bossWith = () => {
  const handlers = new Map<string, WorkHandler>();
  const boss: WorkerBoss = {
    createQueue: async () => undefined,
    work: async (name, _options, handler) => {
      handlers.set(name, handler);
      return name;
    },
    schedule: async () => undefined,
    stop: async () => undefined,
  };
  return { boss, handlers };
};

const job = (data: unknown, extra: Partial<WorkerJob> = {}): WorkerJob => ({ id: '0b5c7a40-1111-4222-8333-444455556666', name: 'test.queue', data, ...extra });

describe('job metrics, request id and error reporting', () => {
  const run = async (handle: () => Promise<void>, workerJob: WorkerJob, fetchSpy = vi.fn(() => Promise.resolve(new Response('{}')))) => {
    const { boss, handlers } = bossWith();
    const metrics = createWorkerMetrics();
    const reporter = createErrorReporter({ dsn: 'https://pub@errors.example.org/3', service: 'worker', fetch: fetchSpy });
    const queue = defineQueue({ name: 'test.queue', payload: z.object({ value: z.number() }), handle });
    await startWorker({ boss, logger: silent, queues: [queue], observer: metrics.observer, reporter });
    const result = await handlers.get('test.queue')?.([workerJob]).then(
      () => 'ok',
      () => 'threw',
    );
    return { result, text: await metrics.registry.render(), fetchSpy };
  };

  it('counts a completed job and times it', async () => {
    const { text } = await run(async () => undefined, job({ value: 1 }));
    expect(text).toContain('candydati_jobs_total{queue="test.queue",outcome="completed"} 1');
    expect(text).toContain('candydati_job_duration_seconds_count{queue="test.queue"} 1');
  });

  it('counts a retry without reporting it, and a final failure with a scrubbed report', async () => {
    const failing = async () => {
      throw Object.assign(new Error('cannot mail ada@example.com'), { params: ['Ada Lovelace'] });
    };
    const retried = await run(failing, job({ value: 1 }, { retryCount: 0, retryLimit: 3 }));
    expect(retried.result).toBe('threw');
    expect(retried.text).toContain('outcome="retry"} 1');
    expect(retried.fetchSpy).not.toHaveBeenCalled();

    const last = await run(failing, job({ value: 1, _requestId: 'req-12345678' }, { retryCount: 3, retryLimit: 3 }));
    expect(last.text).toContain('outcome="failed"} 1');
    expect(last.fetchSpy).toHaveBeenCalledOnce();
    const body = String((last.fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).not.toContain('ada@example.com');
    expect(body).not.toContain('Ada Lovelace');
    expect(body).toContain('"queue":"test.queue"');
    expect(body).toContain('"request_id":"req-12345678"');
  });

  it('counts an invalid payload as such', async () => {
    const { text } = await run(async () => undefined, job({ value: 'nope' }));
    expect(text).toContain('outcome="invalid_payload"} 1');
  });

  it('runs the handler under the request id of the job that queued it, and what it queues carries it on', async () => {
    const sent: unknown[] = [];
    const base: BindableTaskQueue = { enqueue: async (_name, payload) => void sent.push(payload), bindTo: () => ({ enqueue: async () => undefined }) };
    const queue = withRequestId(base);
    let seen: string | undefined;
    await run(async () => {
      seen = currentRequestId();
      await queue.enqueue('email.send' as never, { id: 'x' } as never);
    }, job({ value: 1, _requestId: 'req-12345678' }));
    expect(seen).toBe('req-12345678');
    expect(sent).toEqual([{ id: 'x', _requestId: 'req-12345678' }]);
  });

  it('uses the job id as request id when no request queued the job (the scheduler)', async () => {
    let seen: string | undefined;
    await run(async () => {
      seen = currentRequestId();
    }, job({ value: 1 }));
    expect(seen).toBe('0b5c7a40-1111-4222-8333-444455556666');
  });
});

describe('backlog metrics', () => {
  const reader = (overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {}): SqlReader => ({
    query: async (text) => {
      if (text.includes('from pgboss.queue')) return { rows: overrides.queue ?? [{ name: 'email.send', queued_count: 4, deferred_count: 1, active_count: 2, failed_count: 3 }] };
      if (text.includes('from pgboss.job')) return { rows: overrides.age ?? [{ name: 'email.send', age: 12.5 }] };
      if (text.includes('from outbox_event')) return { rows: overrides.outbox ?? [{ pending: 5, dead: 2, oldest: 90 }] };
      return { rows: overrides.email ?? [{ failed: 7 }] };
    },
  });

  it('exposes queue depth, outbox backlog, dead letters and failed emails as counts', async () => {
    const { registry } = createWorkerMetrics();
    registerBacklogMetrics(registry, reader());
    const text = await registry.render();
    expect(text).toContain('candydati_queue_jobs{queue="email.send",state="queued"} 4');
    expect(text).toContain('candydati_queue_jobs{queue="email.send",state="failed"} 3');
    expect(text).toContain('candydati_queue_oldest_waiting_seconds{queue="email.send"} 12.5');
    expect(text).toContain('candydati_outbox_pending_events 5');
    expect(text).toContain('candydati_outbox_dead_events 2');
    expect(text).toContain('candydati_outbox_oldest_pending_seconds 90');
    expect(text).toContain('candydati_email_failed_messages_24h 7');
  });

  it('still answers when the database does not', async () => {
    const onError = vi.fn();
    const { registry } = createWorkerMetrics(onError);
    registerBacklogMetrics(registry, { query: () => Promise.reject(new Error('down')) });
    expect(await registry.render()).toContain('candydati_build_info');
    expect(onError).toHaveBeenCalled();
  });
});

describe('health server', () => {
  const start = async (overrides: { ready?: boolean; db?: () => Promise<void>; token?: string | null } = {}) => {
    const { registry } = createWorkerMetrics();
    const server = await startHealthServer({
      port: 0,
      host: '127.0.0.1',
      checkDatabase: overrides.db ?? (async () => undefined),
      isReady: () => overrides.ready ?? true,
      metrics: registry,
      metricsToken: overrides.token === undefined ? 'metrics-token-metrics-token' : overrides.token,
      onError: () => undefined,
    });
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    return { base, close: () => new Promise<void>((resolve) => void server.close(() => resolve())) };
  };

  it('answers /health, and /ready once the queues are registered and the database answers', async () => {
    const { base, close } = await start();
    expect((await fetch(`${base}/health`)).status).toBe(200);
    const ready = await fetch(`${base}/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', checks: { database: 'ok', queues: 'ok' } });
    await close();
  });

  it('is not ready while stopping or when the database is down, without details', async () => {
    const stopping = await start({ ready: false });
    expect((await fetch(`${stopping.base}/ready`)).status).toBe(503);
    await stopping.close();
    const down = await start({ db: () => Promise.reject(new Error('password authentication failed for user candydati')) });
    const response = await fetch(`${down.base}/ready`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('password');
    await down.close();
  });

  it('serves /metrics only with the token, and not at all without one configured', async () => {
    const { base, close } = await start();
    expect((await fetch(`${base}/metrics`)).status).toBe(401);
    const ok = await fetch(`${base}/metrics`, { headers: { authorization: 'Bearer metrics-token-metrics-token' } });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('candydati_jobs_total');
    await close();
    const off = await start({ token: null });
    expect((await fetch(`${off.base}/metrics`, { headers: { authorization: 'Bearer anything' } })).status).toBe(404);
    expect((await fetch(`${off.base}/health`, { method: 'POST' })).status).toBe(405);
    await off.close();
  });
});
