import { describe, expect, it } from 'vitest';
import { daysSince, isStaleJob, lastJobActivityAt, staleCutoff, staleJobDedupeKey, STALE_JOB_DAYS } from './stale.js';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('stale ads', () => {
  it('is 90 days', () => {
    expect(STALE_JOB_DAYS).toBe(90);
  });

  it('takes the latest of publication, update and application activity', () => {
    expect(lastJobActivityAt({ publishedAt: d('2026-01-01'), updatedAt: d('2026-02-01'), lastApplicationActivityAt: null })).toEqual(d('2026-02-01'));
    expect(lastJobActivityAt({ publishedAt: d('2026-01-01'), updatedAt: d('2026-02-01'), lastApplicationActivityAt: d('2026-03-01') })).toEqual(d('2026-03-01'));
    expect(lastJobActivityAt({ publishedAt: null, updatedAt: d('2026-02-01'), lastApplicationActivityAt: null })).toEqual(d('2026-02-01'));
  });

  it('is stale exactly at the cutoff and not a day before', () => {
    const now = d('2026-06-01');
    expect(staleCutoff(now)).toEqual(d('2026-03-03'));
    expect(isStaleJob(d('2026-03-03'), now)).toBe(true);
    expect(isStaleJob(d('2026-03-04'), now)).toBe(false);
    expect(daysSince(d('2026-03-03'), now)).toBe(90);
  });

  it('dedupes per period: a new activity is a new period', () => {
    expect(staleJobDedupeKey('j1', d('2026-01-01'))).toBe(staleJobDedupeKey('j1', d('2026-01-01')));
    expect(staleJobDedupeKey('j1', d('2026-01-01'))).not.toBe(staleJobDedupeKey('j1', d('2026-02-01')));
  });
});
