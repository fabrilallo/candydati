import { describe, expect, it, vi } from 'vitest';
import { createPgBossQueue, TASK_RETRY, WEBHOOK_RETRY, type BossSender } from './pg-boss-queue.js';

const fakeBoss = (id: string | null = 'job-1'): BossSender & { send: ReturnType<typeof vi.fn>; createQueue: ReturnType<typeof vi.fn> } => ({
  send: vi.fn(async () => id),
  createQueue: vi.fn(async () => undefined),
});

const payload = { organizationId: 'org', applicationId: 'app' };

describe('createPgBossQueue', () => {
  it('creates the queue once and sends the ids with limited retries', async () => {
    const boss = fakeBoss();
    const queue = createPgBossQueue(boss);
    await queue.enqueue('cv.extract', payload);
    await queue.enqueue('cv.extract', payload);
    expect(boss.createQueue).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith('cv.extract', payload, TASK_RETRY);
    expect(TASK_RETRY.retryLimit).toBeLessThanOrEqual(3);
  });

  it('retries webhook deliveries five times', async () => {
    const boss = fakeBoss();
    await createPgBossQueue(boss).enqueue('webhook.deliver', payload);
    expect(boss.send).toHaveBeenCalledWith('webhook.deliver', payload, WEBHOOK_RETRY);
    expect(WEBHOOK_RETRY.retryLimit).toBe(5);
  });

  it('fails when pg-boss drops the job', async () => {
    await expect(createPgBossQueue(fakeBoss(null)).enqueue('cv.extract', payload)).rejects.toThrow(/not queued/);
  });

  it('propagates a send error', async () => {
    const boss = fakeBoss();
    boss.send.mockRejectedValueOnce(new Error('db down'));
    await expect(createPgBossQueue(boss).enqueue('cv.extract', payload)).rejects.toThrow('db down');
  });
});
