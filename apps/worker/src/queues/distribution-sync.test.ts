import { buildJob, createFakeDistributionChannel, createTestDistributionDeps, DISTRIBUTION_ORG } from '@candydati/core/testing';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createDistributionSyncQueue, distributionSyncPayload } from './distribution-sync.js';

const logger = pino({ level: 'silent' });
const run = (lastAttempt: boolean, attempt = 1) => ({ jobId: 'q1', payload: { organizationId: DISTRIBUTION_ORG, jobId: 'job_1' }, logger, lastAttempt, attempt });
const published = buildJob({ id: 'job_1', organizationId: DISTRIBUTION_ORG, status: 'published', publishedAt: new Date('2026-05-01T00:00:00Z') });

describe('distribution.sync', () => {
  it('rejects a payload without ids', () => {
    expect(distributionSyncPayload.safeParse({ organizationId: DISTRIBUTION_ORG }).success).toBe(false);
    expect(distributionSyncPayload.safeParse({ organizationId: DISTRIBUTION_ORG, jobId: 'job_1' }).success).toBe(true);
  });

  it('is a no-op that records nothing with the empty registry', async () => {
    const deps = createTestDistributionDeps({ channels: [] });
    await deps.jobs.create(published);
    await createDistributionSyncQueue(deps).handle(run(true));
    expect(deps.distributions.snapshot()).toEqual([]);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('publishes to a registered channel and records the status', async () => {
    const deps = createTestDistributionDeps();
    await deps.jobs.create(published);
    await createDistributionSyncQueue(deps).handle(run(false));
    expect(deps.distributions.snapshot()).toEqual([expect.objectContaining({ channelId: 'fake-board', status: 'published', externalId: 'ext-backend-developer-abc123' })]);
  });

  it('rethrows a channel failure while retries remain, so pg-boss retries, and succeeds on the retry', async () => {
    const channel = createFakeDistributionChannel();
    channel.fail('board down');
    const deps = createTestDistributionDeps({ channels: [channel] });
    await deps.jobs.create(published);
    const queue = createDistributionSyncQueue(deps);
    await expect(queue.handle(run(false, 1))).rejects.toThrow(/distribution_failed:1/);
    expect(deps.distributions.snapshot()[0]).toMatchObject({ status: 'failed', error: 'board down' });
    channel.succeed();
    await queue.handle(run(false, 2));
    expect(deps.distributions.snapshot()[0]).toMatchObject({ status: 'published', error: null });
  });

  it('keeps the failed status on the last attempt without throwing', async () => {
    const channel = createFakeDistributionChannel();
    channel.fail('board down');
    const deps = createTestDistributionDeps({ channels: [channel] });
    await deps.jobs.create(published);
    await expect(createDistributionSyncQueue(deps).handle(run(true, 6))).resolves.toBeUndefined();
    expect(deps.distributions.snapshot()[0]).toMatchObject({ status: 'failed', error: 'board down' });
  });

  it('takes a closed job down and ignores a job that is gone', async () => {
    const deps = createTestDistributionDeps();
    await deps.jobs.create(published);
    const queue = createDistributionSyncQueue(deps);
    await queue.handle(run(false));
    await deps.jobs.transition(published.organizationId, published.id, 'published', { status: 'closed', closedAt: new Date(), updatedAt: new Date() });
    await queue.handle(run(false));
    expect(deps.distributions.snapshot()[0]?.status).toBe('removed');
    await expect(queue.handle({ ...run(false), payload: { organizationId: DISTRIBUTION_ORG, jobId: 'gone' } })).resolves.toBeUndefined();
  });
});
