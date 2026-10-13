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
    work: vi.fn(async (name: string, handler: WorkHandler) => {
      handlers.set(name, handler);
      return `${name}-worker`;
    }),
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

  it('fails the job with a clear error and skips the handler when the payload is invalid', async () => {
    const { boss, handlers } = createFakeBoss();
    const handle = vi.fn(async () => undefined);
    await startWorker({ boss, logger: silentLogger, queues: [countingQueue(handle)] });

    const run = handlers.get('test.queue')?.([job('bad-1', { value: 'not-a-number' })]);

    await expect(run).rejects.toThrow(/Invalid payload for queue "test\.queue" \(job bad-1\): value/);
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not echo the rejected payload in the error message', async () => {
    const { boss, handlers } = createFakeBoss();
    await startWorker({ boss, logger: silentLogger, queues: [countingQueue()] });

    const run = handlers.get('test.queue')?.([job('bad-2', { value: 'secret-token-123' })]);

    await expect(run).rejects.not.toThrow(/secret-token-123/);
  });

  it('rejects a payload that is not an object', async () => {
    const { boss, handlers } = createFakeBoss();
    await startWorker({ boss, logger: silentLogger, queues: [countingQueue()] });

    await expect(handlers.get('test.queue')?.([job('bad-3', null)])).rejects.toThrow(/Invalid payload/);
  });

  it('logs ready after registering the queues', async () => {
    const { boss } = createFakeBoss();
    const info = vi.spyOn(silentLogger, 'info');

    await startWorker({ boss, logger: silentLogger, queues: QUEUE_DEFINITIONS });

    expect(info).toHaveBeenCalledWith(expect.objectContaining({ queues: ['system.heartbeat'] }), 'worker ready');
    info.mockRestore();
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
