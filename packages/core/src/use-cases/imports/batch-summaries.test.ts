import { describe, expect, it } from 'vitest';
import { createInMemoryUserDirectory } from '../../testing/in-memory-candidates.js';
import { importWorld, MARIO, MARIO_ROW, readyBatch } from '../../testing/import-fixtures.js';
import { ORG_A, ORG_B } from '../../testing/index.js';
import { describeImportBatches, SAMPLES_PER_COLUMN } from './batch-summaries.js';

describe('describeImportBatches', () => {
  it('adds the target job and the author by name, looking each job up once', async () => {
    const deps = importWorld();
    const first = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const second = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    let jobLookups = 0;
    const counted = { ...deps, users: createInMemoryUserDirectory({ [first.createdBy]: 'Owner' }), jobs: { ...deps.jobs, findById: async (o: string, id: string) => (jobLookups++, deps.jobs.findById(o, id)) } };
    const summaries = await describeImportBatches(counted, ORG_A, [first, second]);
    expect(summaries.map((s) => [s.batch.id, s.job?.id, s.createdBy])).toEqual([
      [first.id, first.jobId, { id: first.createdBy, name: 'Owner' }],
      [second.id, second.jobId, { id: second.createdBy, name: 'Owner' }],
    ]);
    expect(jobLookups).toBe(1);
    expect(summaries[0]).not.toHaveProperty('columnSamples');
  });

  it('with samples, shows the first non-empty values of each column, shortened', async () => {
    const deps = { ...importWorld(), users: createInMemoryUserDirectory() };
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const [summary] = await describeImportBatches(deps, ORG_A, [batch], { withSamples: true });
    expect(summary?.columnSamples?.['Nome']).toEqual(['Mario']);
    expect(summary?.createdBy.name).toBe('');
    expect(Object.values(summary?.columnSamples ?? {}).every((values) => values.length <= SAMPLES_PER_COLUMN)).toBe(true);
  });

  it('never resolves anything of another organization', async () => {
    const deps = { ...importWorld(), users: createInMemoryUserDirectory() };
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const [summary] = await describeImportBatches(deps, ORG_B, [batch], { withSamples: true });
    expect(summary?.job).toBeNull();
    expect(summary?.columnSamples).toEqual({});
  });
});
