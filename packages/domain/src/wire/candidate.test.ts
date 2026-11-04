import { describe, expect, it } from 'vitest';
import { applicationCardSchema, candidateApplicationSchema, candidateDetailSchema, noteSchema, restrictedStagesSchema } from './candidate.js';

const card = {
  id: 'a1',
  jobId: 'j1',
  stageId: 'received',
  outcome: null,
  createdAt: '2026-10-10T09:00:00.000Z',
  stageChangedAt: '2026-10-10T09:00:00.000Z',
  closedAt: null,
  offerAcceptedOn: null,
  startOn: null,
  noteCount: 0,
  stageRemoved: false,
  hasCv: true,
  origin: 'linkedin',
  campaign: 'autumn-2026',
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

  it('reads a card without a CV and requires the flag', () => {
    expect(applicationCardSchema.parse({ ...card, hasCv: false }).hasCv).toBe(false);
    expect(() => applicationCardSchema.parse({ ...card, hasCv: undefined })).toThrow();
  });

  it('reads the origin of a card and requires it', () => {
    expect(applicationCardSchema.parse(card)).toMatchObject({ origin: 'linkedin', campaign: 'autumn-2026' });
    expect(applicationCardSchema.parse({ ...card, campaign: null }).campaign).toBeNull();
    expect(() => applicationCardSchema.parse({ ...card, origin: undefined })).toThrow();
    expect(candidateApplicationSchema.shape.origin.parse('direct')).toBe('direct');
  });

  it('reads a null CV on the detail and a note by an external author', () => {
    const note = { id: 'n', applicationId: null, stageId: null, restricted: false, author: { id: null, name: 'Giulia Rossi', external: true }, body: 'b', createdAt: '2026-10-10T09:00:00.000Z' };
    expect(noteSchema.parse(note).author).toEqual({ id: null, name: 'Giulia Rossi', external: true });
    expect(candidateApplicationSchema.shape.cv.parse(null)).toBeNull();
  });

  it('reads the restricted-stage fields and refuses a note without them', () => {
    const note = { id: 'n', applicationId: 'a', stageId: 'stage-1', restricted: true, author: { id: 'u', name: 'Hugo', external: false }, body: 'b', createdAt: '2026-10-10T09:00:00.000Z' };
    expect(noteSchema.parse(note)).toMatchObject({ stageId: 'stage-1', restricted: true });
    expect(noteSchema.safeParse({ ...note, restricted: undefined }).success).toBe(false);
    expect(candidateApplicationSchema.shape.restrictedStageIds.parse(['stage-1'])).toEqual(['stage-1']);
    expect(restrictedStagesSchema.parse({ jobId: 'j', stageIds: ['stage-1'], canManage: false })).toEqual({ jobId: 'j', stageIds: ['stage-1'], canManage: false });
  });

  it('requires the cv and extraction of an application of the detail', () => {
    expect(() => candidateDetailSchema.parse({ candidate: {}, applications: [], notes: [] })).toThrow();
  });
});
