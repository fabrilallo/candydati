import { describe, expect, it, vi } from 'vitest';
import { createPgBossQueue, FILES_DELETE_RETRY, MIGRATION_FETCH_RETRY, singletonJobId, TASK_RETRY, WEBHOOK_RETRY, type BossSender } from './pg-boss-queue.js';

type FakeBoss = BossSender & { send: ReturnType<typeof vi.fn>; createQueue: ReturnType<typeof vi.fn>; getJobById: ReturnType<typeof vi.fn>; deleteJob: ReturnType<typeof vi.fn> };

const fakeBoss = (id: string | null = 'job-1', existing: { state: string } | null = null): FakeBoss => ({
  send: vi.fn(async () => id),
  createQueue: vi.fn(async () => undefined),
  getJobById: vi.fn(async () => existing),
  deleteJob: vi.fn(async () => undefined),
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

  it('retries webhook deliveries and distribution syncs with exponential backoff over at least 24 hours', async () => {
    const boss = fakeBoss();
    await createPgBossQueue(boss).enqueue('webhook.deliver', { organizationId: 'o', eventId: 'e', endpointId: 'h' });
    await createPgBossQueue(boss).enqueue('distribution.sync', { organizationId: 'o', jobId: 'j' });
    expect(boss.send).toHaveBeenCalledWith('webhook.deliver', { organizationId: 'o', eventId: 'e', endpointId: 'h' }, WEBHOOK_RETRY);
    expect(boss.send).toHaveBeenCalledWith('distribution.sync', { organizationId: 'o', jobId: 'j' }, WEBHOOK_RETRY);
    expect(WEBHOOK_RETRY.retryBackoff).toBe(true);
    // pg-boss waits at least half of `retryDelay * 2^n` (jittered), capped at `retryDelayMax`.
    let shortest = 0;
    for (let retry = 1; retry <= WEBHOOK_RETRY.retryLimit; retry += 1) {
      shortest += Math.min(WEBHOOK_RETRY.retryDelayMax ?? Infinity, (WEBHOOK_RETRY.retryDelay * 2 ** retry) / 2);
    }
    expect(shortest).toBeGreaterThanOrEqual(24 * 60 * 60);
  });

  it('binds to an executor: the task is sent on it (the caller\'s transaction) with the same options', async () => {
    const boss = fakeBoss();
    const executor = { executeSql: vi.fn(async () => ({ rows: [] })) };
    const queue = createPgBossQueue(boss);
    await queue.bindTo(executor).enqueue('email.send', { organizationId: 'o', messageId: 'm' }, { singletonKey: 'm' });
    expect(boss.send).toHaveBeenCalledWith('email.send', { organizationId: 'o', messageId: 'm' }, { ...TASK_RETRY, id: singletonJobId('email.send', 'm'), singletonKey: 'm', db: executor });
    await queue.enqueue('email.send', { organizationId: 'o', messageId: 'm' });
    expect(boss.createQueue).toHaveBeenCalledTimes(1);
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

  describe('replaceFailed', () => {
    const task = { organizationId: 'o', messageId: 'm' };
    const id = singletonJobId('email.send', 'm');

    it('deletes a job of that key that failed for good, then sends again', async () => {
      const boss = fakeBoss('job-2', { state: 'failed' });
      await createPgBossQueue(boss).enqueue('email.send', task, { singletonKey: 'm', replaceFailed: true });
      expect(boss.getJobById).toHaveBeenCalledWith('email.send', id);
      expect(boss.deleteJob).toHaveBeenCalledWith('email.send', id);
      expect(boss.send).toHaveBeenCalledTimes(1);
    });

    it('leaves a job that is still waiting or running alone', async () => {
      for (const state of ['created', 'retry', 'active']) {
        const boss = fakeBoss(null, { state });
        await createPgBossQueue(boss).enqueue('email.send', task, { singletonKey: 'm', replaceFailed: true });
        expect(boss.deleteJob).not.toHaveBeenCalled();
      }
    });

    it('does not look anything up without the option', async () => {
      const boss = fakeBoss(null, { state: 'failed' });
      await createPgBossQueue(boss).enqueue('email.send', task, { singletonKey: 'm' });
      expect(boss.getJobById).not.toHaveBeenCalled();
    });
  });

  it('never retries a migration fetch (its credentials are gone) and lets it run for hours', async () => {
    const boss = { send: vi.fn(async () => 'id'), createQueue: vi.fn(async () => undefined), getJobById: vi.fn(async () => null), deleteJob: vi.fn(async () => undefined) };
    await createPgBossQueue(boss).enqueue('migration.fetch', { organizationId: 'o', batchId: 'b' }, { singletonKey: 'b' });
    expect(boss.send.mock.calls[0]?.[2]).toMatchObject({ retryLimit: 0, expireInSeconds: 12 * 60 * 60, singletonKey: 'b' });
    expect(MIGRATION_FETCH_RETRY.retryLimit).toBe(0);
  });
});
