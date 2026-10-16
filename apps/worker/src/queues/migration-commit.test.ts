import { ORG_A, seedMigrationCommitWorld } from '@candydati/core/testing';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createMigrationCommitQueue, MIGRATION_COMMIT_QUEUE } from './migration-commit.js';

const logger = pino({ level: 'silent' });

describe('migration.commit', () => {
  it('takes ids only, and skips a batch that is not importing', async () => {
    const deps = seedMigrationCommitWorld();
    const queue = createMigrationCommitQueue(deps);
    expect(queue.name).toBe(MIGRATION_COMMIT_QUEUE);
    await expect(queue.handle({ jobId: 'j1', payload: { organizationId: ORG_A, batchId: 'missing' }, logger, lastAttempt: false, attempt: 1 })).resolves.toBeUndefined();
    expect(queue.payload.safeParse({ organizationId: ORG_A }).success).toBe(false);
  });
});
