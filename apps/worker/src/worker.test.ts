import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineQueue, QUEUE_DEFINITIONS } from './queues/definitions.js';
import { startWorker, type WorkerBoss, type WorkerJob } from './worker.js';

type WorkHandler = Parameters<WorkerBoss['work']>[1];

const silentLogger = pino({ level: 'silent' });

const createFakeBoss = () => {
  const handlers = new Map<string, WorkHandler>();
  const created: string[] = [];
  const boss = {
    createQueue: vi.fn(async (name: string) => {
      created.push(name);
    }),
    work: vi.fn(async (name: string, _options: unknown, handler: WorkHandler) => {
      handlers.set(name, handler);
      return `${name}-worker`;
    }),
    schedule: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
  return { boss, handlers, created };
};

const job = (id: string, data: unknown): WorkerJob => ({ id, name: 'test.queue', data });

const countingQueue = (handle = vi.fn(async () => undefined)) =>
  defineQueue({
    name: 'test.queue',
    payload: z.object({ value: z.number().int() }),
    handle,
  });

describe('startWorker', () => {
  it('creates every queue and registers a handler for it', async () => {
    const { boss, handlers, created } = createFakeBoss();

    await startWorker({ boss, logger: silentLogger, queues: QUEUE_DEFINITIONS });

    expect(created).toEqual(QUEUE_DEFINITIONS.map((definition) => definition.name));
    for (const definition of QUEUE_DEFINITIONS) {
      expect(handlers.has(definition.name)).toBe(true);
    }
  });

  it('rejects duplicate queue names before touching the boss', async () => {
    const { boss } = createFakeBoss();
    const queue = countingQueue();

    await expect(startWorker({ boss, logger: silentLogger, queues: [queue, queue] })).rejects.toThrow(/duplicate/i);
    expect(boss.createQueue).not.toHaveBeenCalled();
  });

  it('propagates a createQueue failure', async () => {
    const { boss } = createFakeBoss();
    boss.createQueue.mockRejectedValueOnce(new Error('db down'));

    await expect(startWorker({ boss, logger: silentLogger, queues: QUEUE_DEFINITIONS })).rejects.toThrow('db down');
  });

  it('runs the handler with the parsed payload for every job in the batch', async () => {
    const { boss, handlers } = createFakeBoss();
    const handle = vi.fn(async () => undefined);
    await startWorker({ boss, logger: silentLogger, queues: [countingQueue(handle)] });

    await handlers.get('test.queue')?.([job('a', { value: 1 }), job('b', { value: 2 })]);

    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle.mock.calls[0]?.[0]).toMatchObject({ jobId: 'a', payload: { value: 1 } });
    expect(handle.mock.calls[1]?.[0]).toMatchObject({ jobId: 'b', payload: { value: 2 } });
  });

  it('logs an invalid payload (field paths only) and completes the job without retrying it or running the handler', async () => {
    const { boss, handlers } = createFakeBoss();
    const handle = vi.fn(async () => undefined);
    const error = vi.spyOn(silentLogger, 'error');
    await startWorker({ boss, logger: silentLogger, queues: [countingQueue(handle)] });

    await expect(handlers.get('test.queue')?.([job('bad-1', { value: 'secret-token-123' })])).resolves.toBeUndefined();
    await expect(handlers.get('test.queue')?.([job('bad-3', null)])).resolves.toBeUndefined();

    expect(handle).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith({ queue: 'test.queue', jobId: 'bad-1', fields: ['value'] }, 'invalid job payload, dropped');
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-token-123');
    error.mockRestore();
  });

  it('logs a failing handler with queue, job id, attempt and a safe error code, then rethrows so pg-boss retries', async () => {
    const { boss, handlers } = createFakeBoss();
    const failure = Object.assign(new Error('duplicate key alice@example.org'), { code: '23505' });
    const error = vi.spyOn(silentLogger, 'error');
    await startWorker({ boss, logger: silentLogger, queues: [countingQueue(vi.fn(async () => Promise.reject(failure)))] });

    await expect(handlers.get('test.queue')?.([{ ...job('j-9', { value: 1 }), retryCount: 1, retryLimit: 3 }])).rejects.toBe(failure);

    expect(error).toHaveBeenCalledWith({ queue: 'test.queue', jobId: 'j-9', attempt: 2, lastAttempt: false, error: 'pg_23505' }, 'job failed');
    expect(JSON.stringify(error.mock.calls)).not.toContain('alice');
    error.mockRestore();
  });

  it('logs ready after registering the queues', async () => {
    const { boss } = createFakeBoss();
    const info = vi.spyOn(silentLogger, 'info');

    await startWorker({ boss, logger: silentLogger, queues: QUEUE_DEFINITIONS });

    expect(info).toHaveBeenCalledWith(expect.objectContaining({ queues: ['system.heartbeat'] }), 'worker ready');
    info.mockRestore();
  });
});

describe('startWorker schedules', () => {
  it('registers the cron of a scheduled queue after its handler, and only for those', async () => {
    const { boss } = createFakeBoss();
    const scheduled = defineQueue({ name: 'tick', payload: z.unknown(), schedule: { cron: '0 * * * *', data: {} }, handle: async () => undefined });
    await startWorker({ boss, logger: silentLogger, queues: [countingQueue(), scheduled] });
    expect(boss.schedule).toHaveBeenCalledTimes(1);
    expect(boss.schedule).toHaveBeenCalledWith('tick', '0 * * * *', {});
  });
});

describe('startWorker stop()', () => {
  it('stops the boss gracefully with a timeout', async () => {
    const { boss } = createFakeBoss();
    const worker = await startWorker({ boss, logger: silentLogger, queues: QUEUE_DEFINITIONS });

    await worker.stop();

    expect(boss.stop).toHaveBeenCalledTimes(1);
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 30_000 });
  });

  it('stops the boss only once when called repeatedly', async () => {
    const { boss } = createFakeBoss();
    const worker = await startWorker({ boss, logger: silentLogger, queues: QUEUE_DEFINITIONS });

    await Promise.all([worker.stop(), worker.stop()]);
    await worker.stop();

    expect(boss.stop).toHaveBeenCalledTimes(1);
  });
});

describe('retry metadata', () => {
  it('tells the handler whether the job is on its last attempt', async () => {
    const { boss, handlers } = createFakeBoss();
    const seen: boolean[] = [];
    const queue = defineQueue({
      name: 'test.queue',
      payload: z.object({ value: z.number().int() }),
      handle: async ({ lastAttempt }) => void seen.push(lastAttempt),
    });
    await startWorker({ boss, logger: silentLogger, queues: [queue] });

    await handlers.get('test.queue')!([
      { ...job('a', { value: 1 }), retryCount: 0, retryLimit: 3 },
      { ...job('b', { value: 1 }), retryCount: 3, retryLimit: 3 },
      job('c', { value: 1 }),
    ]);

    expect(seen).toEqual([false, true, true]);
    expect(boss.work).toHaveBeenCalledWith('test.queue', { includeMetadata: true }, expect.any(Function));
  });
});
