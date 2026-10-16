import { describe, expect, it } from 'vitest';
import { migrationBatchDtoSchema, migrationChoicesInputSchema, migrationCommitInputSchema } from './dto.js';

const batch = {
  id: 'b1',
  status: 'ready',
  sourceSystem: 'oldats',
  producer: 'test@1',
  connectorMaturity: 'package',
  counts: { jobs: 1, perJob: [{ jobRef: 'j1', title: 'Backend', status: 'closed', stages: 2, applications: 3, open: 0, hired: 1, notSelected: 2, withdrawn: 0 }] },
  stageMapping: [{ jobRef: 'j1', stageRef: 's1', sourceName: 'Applied', type: 'received', title: 'Applied' }],
  excludedJobs: [],
  declarations: null,
  error: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  updatedAt: '2026-10-16T10:00:00.000Z',
  committedAt: null,
  undoneAt: null,
  purgedAt: null,
};

describe('migration dto', () => {
  it('reads a batch as the api sends it', () => {
    expect(migrationBatchDtoSchema.safeParse(batch).success).toBe(true);
  });

  it('refuses a status it does not know', () => {
    expect(migrationBatchDtoSchema.safeParse({ ...batch, status: 'weird' }).success).toBe(false);
  });

  it('needs all three declarations to be literally true', () => {
    const all = { controller: true, previewChecked: true, processorsOwned: true };
    expect(migrationCommitInputSchema.safeParse({ declarations: all }).success).toBe(true);
    expect(migrationCommitInputSchema.safeParse({ declarations: { ...all, processorsOwned: false } }).success).toBe(false);
    expect(migrationCommitInputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts only false for includeExpired', () => {
    expect(migrationChoicesInputSchema.safeParse({ includeExpired: false }).success).toBe(true);
    expect(migrationChoicesInputSchema.safeParse({ includeExpired: true }).success).toBe(false);
  });
});
