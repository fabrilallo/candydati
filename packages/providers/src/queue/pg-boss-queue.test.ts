import { describe, expect, it, vi } from 'vitest';
import { createPgBossQueue, FILES_DELETE_RETRY, singletonJobId, TASK_RETRY, WEBHOOK_RETRY, type BossSender } from './pg-boss-queue.js';

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

  it('retries webhook deliveries and distribution syncs five times with backoff', async () => {
    const boss = fakeBoss();
    await createPgBossQueue(boss).enqueue('webhook.deliver', { organizationId: 'o', eventId: 'e', endpointId: 'h' });
    await createPgBossQueue(boss).enqueue('distribution.sync', { organizationId: 'o', jobId: 'j' });
    expect(boss.send).toHaveBeenCalledWith('webhook.deliver', { organizationId: 'o', eventId: 'e', endpointId: 'h' }, WEBHOOK_RETRY);
    expect(boss.send).toHaveBeenCalledWith('distribution.sync', { organizationId: 'o', jobId: 'j' }, WEBHOOK_RETRY);
    expect(WEBHOOK_RETRY).toMatchObject({ retryLimit: 5, retryBackoff: true });
  });

  it('retries file deletions eight times, so storage can be down for hours', async () => {
    const boss = fakeBoss();
    await createPgBossQueue(boss).enqueue('files.delete', { organizationId: 'org', key: 'organizations/org/x' });
    expect(boss.send).toHaveBeenCalledWith('files.delete', { organizationId: 'org', key: 'organizations/org/x' }, FILES_DELETE_RETRY);
    expect(FILES_DELETE_RETRY.retryLimit).toBe(8);
  });

  it('fails when pg-boss drops a job without a singleton key, and propagates a send error', async () => {
    await expect(createPgBossQueue(fakeBoss(null)).enqueue('cv.extract', payload)).rejects.toThrow(/not queued/);
    const boss = fakeBoss();
    boss.send.mockRejectedValueOnce(new Error('db down'));
    await expect(createPgBossQueue(boss).enqueue('cv.extract', payload)).rejects.toThrow('db down');
  });

  it('gives a task with a singleton key a stable job id, and accepts the repeat pg-boss drops', async () => {
    const boss = fakeBoss(null);
    const queue = createPgBossQueue(boss);
    await queue.enqueue('import.commit', { organizationId: 'o', batchId: 'b' }, { singletonKey: 'b' });
    await queue.enqueue('import.commit', { organizationId: 'o', batchId: 'b' }, { singletonKey: 'b' });
    const ids = boss.send.mock.calls.map((call) => (call[2] as { id: string }).id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).toBe(singletonJobId('import.commit', 'b'));
    expect(boss.send.mock.calls[0]?.[2]).toMatchObject({ ...TASK_RETRY, singletonKey: 'b' });
  });

  it('derives a valid, distinct UUID per task name and key', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(singletonJobId('email.send', 'm1')).toMatch(uuid);
    expect(singletonJobId('email.send', 'm1')).not.toBe(singletonJobId('email.send', 'm2'));
    expect(singletonJobId('email.send', 'm1')).not.toBe(singletonJobId('webhook.deliver', 'm1'));
  });
});
