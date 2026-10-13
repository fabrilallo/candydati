import { describe, expect, it } from 'vitest';
import { jobDtoSchema } from './job.js';

const base = {
  id: 'j1',
  slug: 's',
  status: 'draft',
  content: { title: 'x' },
  quality: null,
  publishIssues: [{ path: 'title', rule: 'gender_exclusive_title', detail: { match: 'Addetto', suggestion: 'Addetto/a' } }, { path: 'role', rule: 'required' }],
  complianceWarnings: [{ path: 'summary', rule: 'age_proxy', detail: { match: 'giovane', suggestion: 'x' } }],
  createdAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-13T09:00:00.000Z',
  publishedAt: null,
  closedAt: null,
};

describe('jobDtoSchema compliance fields', () => {
  it('carries the offending text on issues and the warnings next to them', () => {
    const parsed = jobDtoSchema.parse(base);
    expect(parsed.publishIssues[0]?.detail?.match).toBe('Addetto');
    expect(parsed.publishIssues[1]?.detail).toBeUndefined();
    expect(parsed.complianceWarnings[0]?.rule).toBe('age_proxy');
  });

  it('rejects an unknown warning rule', () => {
    expect(jobDtoSchema.safeParse({ ...base, complianceWarnings: [{ path: 'a', rule: 'nope', detail: { match: 'a', suggestion: 'b' } }] }).success).toBe(false);
  });
});
