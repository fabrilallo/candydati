import { describe, expect, it } from 'vitest';
import { jobApprovalStatusSchema, jobRequestSchema } from './job-request.js';

const at = '2026-03-01T10:00:00.000Z';
const request = {
  id: 'r', organizationId: 'o', title: 'Dev', reason: 'Growth', headcount: 1, salaryMin: 40000, salaryMax: 50000, currency: 'EUR',
  location: { city: 'Milano' }, processNotes: '', interviewersNotes: '', language: 'it', status: 'submitted', requestedBy: 'u1',
  decidedBy: null, decidedAt: null, decisionNote: null, jobId: null, createdAt: at, updatedAt: at,
};

describe('job request wire', () => {
  it('reads the core entity: people by id, optional fields absent', () => {
    const parsed = jobRequestSchema.parse(request);
    expect(parsed.requestedBy).toBe('u1');
    expect(parsed.role).toBeUndefined();
    expect(parsed.location.city).toBe('Milano');
  });

  it('refuses a request without its language or with a person object', () => {
    expect(jobRequestSchema.safeParse({ ...request, language: undefined }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...request, requestedBy: { id: 'u1', name: 'Ada' } }).success).toBe(false);
  });

  it('reads the approval status with and without an approval', () => {
    expect(jobApprovalStatusSchema.parse({ requireApproval: true, approval: null, publishable: false }).approval).toBeNull();
    const approval = { approvedBy: 'u1', approvedAt: at, salaryMin: 1, salaryMax: 2, currency: 'USD' };
    expect(jobApprovalStatusSchema.parse({ requireApproval: true, approval, publishable: true }).approval?.currency).toBe('USD');
  });
});
