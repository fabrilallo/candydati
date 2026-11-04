import { describe, expect, it } from 'vitest';
import { proposalExpiresAt, proposalStaleReason } from './proposal.js';

const created = new Date('2026-03-01T10:00:00Z');
const open = { status: 'open' as const, fromStageId: 'stage-0', expiresAt: proposalExpiresAt(created) };
const inStage = { stageId: 'stage-0', outcome: null };

describe('proposalStaleReason', () => {
  it('lasts 14 days', () => {
    expect(proposalExpiresAt(created).toISOString()).toBe('2026-03-15T10:00:00.000Z');
  });

  it('is live while open, unexpired, undecided and in its stage', () => {
    expect(proposalStaleReason(open, inStage, created)).toBeNull();
  });

  it('names why it can no longer be acted on', () => {
    expect(proposalStaleReason({ ...open, status: 'dismissed' }, inStage, created)).toBe('not_open');
    expect(proposalStaleReason(open, inStage, new Date('2026-03-15T10:00:00Z'))).toBe('expired');
    expect(proposalStaleReason(open, { stageId: 'stage-0', outcome: 'hired' }, created)).toBe('decided');
    expect(proposalStaleReason(open, { stageId: 'stage-1', outcome: null }, created)).toBe('stage_changed');
  });
});
