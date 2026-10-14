import { describe, expect, it } from 'vitest';
import { createInMemoryTaskQueue, CV_KEY_1, CV_KEY_2, ORG_A, seedPrivacyData } from '../../testing/index.js';
import { createInMemoryTransaction } from '../../testing/in-memory-transaction.js';
import { inTransaction } from '../../transaction.js';
import { eraseCandidateData, FileCleanupError } from './erase-candidate-data.js';

const SYSTEM = { type: 'system', id: null, onBehalfOfUserId: null } as const;
const input = { organizationId: ORG_A, candidateId: 'cand_1', reason: 'request', actor: SYSTEM } as const;

type Seeded = Awaited<ReturnType<typeof seedPrivacyData>>;
const failingDelete = (storage: Seeded['files']) => ({ ...storage, delete: async () => Promise.reject(new Error('s3 down')) });

describe('eraseCandidateData inside a caller\'s transaction (#1)', () => {
  it('keeps the CV files while the transaction is open and deletes them only after the commit', async () => {
    const deps = await seedPrivacyData();
    await inTransaction(deps, async (tx) => {
      await eraseCandidateData(tx, input);
      expect(deps.files.keys()).toContain(CV_KEY_1);
    });
    expect(deps.files.keys()).not.toContain(CV_KEY_1);
    expect(deps.files.keys()).not.toContain(CV_KEY_2);
  });

  it('keeps the rows AND the files when the caller\'s transaction rolls back after the erasure', async () => {
    const deps = await seedPrivacyData();
    await expect(
      inTransaction(deps, async (tx) => {
        await eraseCandidateData(tx, input);
        throw new Error('commit failed');
      }),
    ).rejects.toThrow('commit failed');
    expect(deps.store.read().candidates.map((c) => c.id)).toContain('cand_1');
    expect(deps.files.keys()).toHaveLength(3);
    expect(deps.queue.jobs()).toEqual([]);
  });

  it('queues a files.delete retry after the commit when a deletion fails there', async () => {
    const seeded = await seedPrivacyData();
    const deps = { ...seeded, files: failingDelete(seeded.files) };
    await inTransaction(deps, async (tx) => eraseCandidateData(tx, input));
    expect(seeded.queue.jobs()).toEqual([
      { name: 'files.delete', payload: { organizationId: ORG_A, key: CV_KEY_1 } },
      { name: 'files.delete', payload: { organizationId: ORG_A, key: CV_KEY_2 } },
    ]);
  });

  it('reports the keys neither deleted nor queued to the transaction\'s error sink, and the erasure stands', async () => {
    const seeded = await seedPrivacyData();
    const reported: unknown[] = [];
    const deps = {
      ...seeded,
      files: failingDelete(seeded.files),
      queue: createInMemoryTaskQueue(new Error('queue down')),
      transaction: createInMemoryTransaction((error) => reported.push(error)),
    };
    const result = await inTransaction(deps, async (tx) => eraseCandidateData(tx, input));
    expect(result).toEqual({ applicationCount: 2, candidateErased: true });
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(FileCleanupError);
    expect((reported[0] as FileCleanupError).keys).toEqual([CV_KEY_1, CV_KEY_2]);
    expect(seeded.store.read().candidates.map((c) => c.id)).toEqual(['cand_2']);
  });
});
