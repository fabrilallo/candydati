import { importFileKey } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../errors.js';
import { fakePdfBytes, ORG_A } from '../../testing/index.js';
import { importWorld, recruiter } from '../../testing/import-fixtures.js';
import { createImportBatch } from './create-import-batch.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const BATCH = 'batch_streamed';
const keyOf = (name: string) => importFileKey(ORG_A, BATCH, `source/0-${name}`);

describe('createImportBatch with files the api already streamed to storage', () => {
  it('keeps the stored keys and sizes, and does not upload them again', async () => {
    const deps = importWorld();
    await deps.files.put(keyOf('big.zip'), fakePdfBytes(), 'application/octet-stream');
    const batch = await createImportBatch(deps, recruiter, {
      jobId: 'job_1',
      stageId: 'received',
      batchId: BATCH,
      files: [{ fileName: 'big.zip', key: keyOf('big.zip'), sizeBytes: 150 * 1024 * 1024 }],
    });
    expect(batch).toMatchObject({ id: BATCH, status: 'uploaded', counts: { files: 1 } });
    expect(batch.sourceFiles).toEqual([{ key: keyOf('big.zip'), fileName: 'big.zip', sizeBytes: 150 * 1024 * 1024 }]);
    expect(deps.files.keys()).toEqual([keyOf('big.zip')]);
  });

  it('refuses keys outside the batch prefix without touching them, and removes the stored files on any refusal', async () => {
    const deps = importWorld();
    await deps.files.put(keyOf('a.csv'), fakePdfBytes(), 'x/y');
    const foreign = importFileKey(ORG_A, 'another_batch', 'source/0-a.csv');
    await deps.files.put(foreign, fakePdfBytes(), 'x/y');
    const files = [{ fileName: 'a.csv', key: foreign, sizeBytes: 10 }];
    expect(await rejection(createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', batchId: BATCH, files }))).toBeInstanceOf(ValidationError);
    const own = [{ fileName: 'a.csv', key: keyOf('a.csv'), sizeBytes: 10 }];
    expect(await rejection(createImportBatch(deps, recruiter, { jobId: 'nope', stageId: 'received', batchId: BATCH, files: own }))).toBeInstanceOf(NotFoundError);
    expect(deps.files.keys()).not.toContain(keyOf('a.csv'));
  });

  it('refuses a batch whose stored files add up to more than the limit, and empty ones', async () => {
    const deps = importWorld();
    const big = [{ fileName: 'a.zip', key: keyOf('a.zip'), sizeBytes: 201 * 1024 * 1024 }];
    expect(await rejection(createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', batchId: BATCH, files: big }))).toBeInstanceOf(ValidationError);
    const empty = [{ fileName: 'a.csv', key: keyOf('a.csv'), sizeBytes: 0 }];
    expect(await rejection(createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', batchId: BATCH, files: empty }))).toBeInstanceOf(ValidationError);
  });
});
