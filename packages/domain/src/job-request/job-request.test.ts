import { describe, expect, it } from 'vitest';
import { checkApproval, jobContentFromRequest, jobRequestInputSchema, type JobApproval, type JobRequest } from './job-request.js';

const approval: JobApproval = { approvedBy: 'u', approvedAt: new Date(), salaryMin: 40000, salaryMax: 50000, currency: 'EUR' };
const valid = { title: 'Backend Developer', reason: 'Growth', salaryMin: 40000, salaryMax: 50000 };

describe('jobRequestInputSchema', () => {
  it('fills the defaults', () => {
    const parsed = jobRequestInputSchema.parse(valid);
    expect(parsed).toMatchObject({ headcount: 1, currency: 'EUR', language: 'it', processNotes: '', location: {} });
  });
  it('requires a reason and a coherent budget', () => {
    expect(jobRequestInputSchema.safeParse({ ...valid, reason: ' ' }).success).toBe(false);
    expect(jobRequestInputSchema.safeParse({ ...valid, salaryMax: 30000 }).success).toBe(false);
    expect(jobRequestInputSchema.safeParse({ ...valid, headcount: 0 }).success).toBe(false);
  });
});

describe('checkApproval', () => {
  const salary = (max: number, currency = 'EUR') => ({ min: 40000, max, currency });
  it('never blocks when approval is off', () => {
    expect(checkApproval(false, null, salary(999999))).toBeNull();
  });
  it('needs an approval when it is on', () => {
    expect(checkApproval(true, null, salary(50000))).toBe('approval_required');
  });
  it('accepts a range inside the approved one and refuses one beyond it or in another currency', () => {
    expect(checkApproval(true, approval, salary(50000))).toBeNull();
    expect(checkApproval(true, approval, { min: 30000, max: 45000, currency: 'EUR' })).toBeNull();
    expect(checkApproval(true, approval, salary(50001))).toBe('approval_range_exceeded');
    expect(checkApproval(true, approval, salary(45000, 'USD'))).toBe('approval_range_exceeded');
  });
});

describe('jobContentFromRequest', () => {
  it('carries what the request knows', () => {
    const request = { ...jobRequestInputSchema.parse({ ...valid, role: 'backend_developer', workMode: 'remote' }) } as unknown as JobRequest;
    const content = jobContentFromRequest(request);
    expect(content).toMatchObject({ title: 'Backend Developer', salary: { min: 40000, max: 50000, currency: 'EUR', period: 'year' }, workMode: 'remote' });
    expect(content).not.toHaveProperty('seniority');
  });
});
