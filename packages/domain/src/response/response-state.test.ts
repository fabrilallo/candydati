import { describe, expect, it } from 'vitest';
import { jobContentSchema } from '../job/content.js';
import { DAY_MS, HOUR_MS, needsEscalation, computeResponseDueAt, responseState, type ResponseTracked } from './response-state.js';

const job = (responseDays?: number) => ({ content: jobContentSchema.parse({ title: 'T', ...(responseDays === undefined ? {} : { responseDays }) }) });
const NOW = new Date('2026-06-10T12:00:00Z');
const base: ResponseTracked = { outcome: null, stageChangedAt: new Date('2026-06-05T12:00:00Z'), responseDueAt: null, respondedAt: null };

describe('computeResponseDueAt', () => {
  it('adds N * 24h to the stage change', () => {
    expect(computeResponseDueAt(new Date('2026-06-01T10:00:00Z'), job(7))).toEqual(new Date('2026-06-08T10:00:00Z'));
  });

  it('is null when the job declares no response time', () => {
    expect(computeResponseDueAt(NOW, job())).toBeNull();
  });
});

describe('responseState', () => {
  it('is closed for a decided application, whatever else is set', () => {
    expect(responseState({ ...base, outcome: 'hired' }, job(1), NOW)).toBe('closed');
  });

  it('is answered once a person responded in this stage', () => {
    expect(responseState({ ...base, respondedAt: NOW }, job(1), NOW)).toBe('answered');
  });

  it('is on_track with more than 48h left', () => {
    expect(responseState({ ...base, responseDueAt: new Date(NOW.getTime() + 48 * HOUR_MS + 1) }, job(7), NOW)).toBe('on_track');
  });

  it('is due_soon at 48h and up to the deadline', () => {
    expect(responseState({ ...base, responseDueAt: new Date(NOW.getTime() + 48 * HOUR_MS) }, job(7), NOW)).toBe('due_soon');
    expect(responseState({ ...base, responseDueAt: NOW }, job(7), NOW)).toBe('due_soon');
  });

  it('is overdue after the deadline', () => {
    expect(responseState({ ...base, responseDueAt: new Date(NOW.getTime() - 1) }, job(7), NOW)).toBe('overdue');
  });

  it('recomputes a missing stored deadline from the stage change and the job', () => {
    expect(responseState(base, job(2), NOW)).toBe('overdue');
    expect(responseState(base, job(30), NOW)).toBe('on_track');
  });

  it('is on_track when there is no deadline at all', () => {
    expect(responseState(base, job(), NOW)).toBe('on_track');
  });
});

describe('needsEscalation', () => {
  it('starts after more than 2 days overdue', () => {
    expect(needsEscalation(new Date(NOW.getTime() - 2 * DAY_MS), NOW)).toBe(false);
    expect(needsEscalation(new Date(NOW.getTime() - 2 * DAY_MS - 1), NOW)).toBe(true);
  });
});
