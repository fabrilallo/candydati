import { describe, expect, it, vi } from 'vitest';
import { createPgBossQueue, TASK_RETRY, WEBHOOK_RETRY, type BossSender } from './pg-boss-queue.js';

const fakeBoss = (id: string | null = 'job-1') => ({ send: vi.fn(async () => id), createQueue: vi.fn(async () => undefined) }) satisfies BossSender;

describe('createPgBossQueue (worker)', () => {
  it('creates a queue once and applies the default retries', async () => {
    const boss = fakeBoss();
    const queue = createPgBossQueue(boss);
    await queue.enqueue('email.send', { messageId: 'm' });
    await queue.enqueue('email.send', { messageId: 'm' });
    expect(boss.createQueue).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith('email.send', { messageId: 'm' }, TASK_RETRY);
  });

  it('retries webhook deliveries five times with backoff', async () => {
    const boss = fakeBoss();
    await createPgBossQueue(boss).enqueue('webhook.deliver', { eventId: 'e' });
    expect(boss.send).toHaveBeenCalledWith('webhook.deliver', { eventId: 'e' }, WEBHOOK_RETRY);
    expect(WEBHOOK_RETRY).toMatchObject({ retryLimit: 5, retryBackoff: true });
  });

  it('fails when pg-boss drops the job', async () => {
    await expect(createPgBossQueue(fakeBoss(null)).enqueue('x', {})).rejects.toThrow(/not queued/);
  });
});
