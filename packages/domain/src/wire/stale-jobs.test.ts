import { describe, expect, it } from 'vitest';
import { staleJobSchema } from './stale-jobs.js';

const job = {
  id: 'j1', slug: 'dev', status: 'published', title: 'Dev', role: 'backend_developer', customRole: null, publishable: true, publishIssueCount: 0,
  salary: { currency: 'EUR', period: 'year' }, workMode: null, qualityTotal: null, belowThreshold: false,
  updatedAt: '2026-06-15T10:00:00.000Z', publishedAt: '2026-06-01T10:00:00.000Z',
};

describe('stale job wire', () => {
  it('reads the job summary with the idle days', () => {
    expect(staleJobSchema.parse({ job, lastActivityAt: '2026-06-15T10:00:00.000Z', daysIdle: 120 }).daysIdle).toBe(120);
  });

  it('refuses the flat shape', () => {
    expect(staleJobSchema.safeParse({ id: 'j1', title: 'Dev', lastActivityAt: '2026-06-15T10:00:00.000Z', daysSinceActivity: 120 }).success).toBe(false);
  });
});
