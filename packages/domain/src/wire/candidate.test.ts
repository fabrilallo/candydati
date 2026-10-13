import { describe, expect, it } from 'vitest';
import { applicationCardSchema, candidateDetailSchema } from './candidate.js';

const card = {
  id: 'a1',
  jobId: 'j1',
  stageId: 'received',
  outcome: null,
  createdAt: '2026-10-10T09:00:00.000Z',
  stageChangedAt: '2026-10-10T09:00:00.000Z',
  closedAt: null,
  noteCount: 0,
  stageRemoved: false,
  responseDueAt: null,
  respondedAt: null,
  responseState: 'on_track',
  consentStatus: 'given',
  importBatchId: null,
  retentionExpiresAt: '2027-10-10T09:00:00.000Z',
  candidate: { id: 'c1', firstName: 'A', lastName: 'B', tags: [], headline: null, location: null, yearsOfExperience: null },
};

describe('candidate wire schemas', () => {
  it('reads a card and refuses a missing response state', () => {
    expect(applicationCardSchema.parse(card).responseState).toBe('on_track');
    expect(() => applicationCardSchema.parse({ ...card, responseState: null })).toThrow();
    expect(() => applicationCardSchema.parse({ ...card, retentionExpiresAt: undefined })).toThrow();
  });

  it('requires the cv and extraction of an application of the detail', () => {
    expect(() => candidateDetailSchema.parse({ candidate: {}, applications: [], notes: [] })).toThrow();
  });
});
