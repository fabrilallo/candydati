import { describe, expect, it } from 'vitest';
import { applicantTimeline, leftAt } from './timeline.js';

const STAGES = ['received', 'chiamata', 'tecnico', 'finale'];
const OPENED = new Date('2026-10-01T09:00:00.000Z');
const ENDED = new Date('2026-11-04T09:00:00.000Z');
const base = { stageIds: STAGES, openedAt: OPENED, endedAt: ENDED, lagDays: 1, gapDays: 3 };

describe('applicantTimeline', () => {
  it('enters every stage up to the current one, in order, the last one lagDays before the end', () => {
    const timeline = applicantTimeline({ ...base, stage: 'tecnico', outcome: null });
    expect(timeline.entries.map((entry) => entry.stageId)).toEqual(['received', 'chiamata', 'tecnico']);
    expect(timeline.entries.at(-1)?.at.toISOString()).toBe('2026-11-03T09:00:00.000Z');
    expect(timeline.entries[0]?.at.toISOString()).toBe('2026-10-28T09:00:00.000Z');
    expect(timeline.decidedAt).toBeNull();
    expect(leftAt(timeline, 2)).toBeNull();
    expect(leftAt(timeline, 0)?.toISOString()).toBe('2026-10-31T09:00:00.000Z');
  });

  it('decides after the last entry', () => {
    const timeline = applicantTimeline({ ...base, stage: 'chiamata', outcome: 'not_selected' });
    expect(timeline.decidedAt?.toISOString()).toBe('2026-11-03T09:00:00.000Z');
    expect(timeline.entries.at(-1)?.at.toISOString()).toBe('2026-10-31T09:00:00.000Z');
    expect(leftAt(timeline, 1)).toEqual(timeline.decidedAt);
  });

  it('squeezes the gaps so nothing happens before the publication', () => {
    const timeline = applicantTimeline({ ...base, openedAt: new Date('2026-11-01T09:00:00.000Z'), stage: 'finale', outcome: 'hired' });
    expect(timeline.entries[0]!.at.getTime()).toBeGreaterThan(new Date('2026-11-01T09:00:00.000Z').getTime());
    const times = [...timeline.entries.map((entry) => entry.at.getTime()), timeline.decidedAt!.getTime()];
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('refuses a stage the job does not declare, and an end before the publication', () => {
    expect(() => applicantTimeline({ ...base, stage: 'offerta', outcome: null })).toThrow(/Unknown stage/);
    expect(() => applicantTimeline({ ...base, lagDays: 40, stage: 'received', outcome: null })).toThrow(/No time/);
  });
});
