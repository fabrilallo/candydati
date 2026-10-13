import { describe, expect, it } from 'vitest';
import { applicationFeedbackSchema, publicFeedbackSchema, stageInterviewersSchema } from './feedback.js';

const at = '2026-03-01T10:00:00.000Z';

describe('feedback wire', () => {
  it('reads a stage interviewer row as core returns it, ignoring the internal columns', () => {
    const parsed = stageInterviewersSchema.parse({
      stageId: 's1',
      interviewers: [{ id: 'i', organizationId: 'o', jobId: 'j', stageId: 's1', kind: 'external', userId: null, email: 'a@b.it', name: 'Ada', createdAt: at }],
    });
    expect(parsed.interviewers[0]).toEqual({ kind: 'external', userId: null, email: 'a@b.it', name: 'Ada' });
  });

  it('reads requests with a status and feedback with its stage label', () => {
    const parsed = applicationFeedbackSchema.parse({
      requests: [{ id: 'r', applicationId: 'a', stageId: 's', stageLabel: 'Tecnico', interviewerKind: 'member', interviewerName: 'Ada', status: 'expired', remindersSent: 2, createdAt: at, expiresAt: at, submittedAt: null }],
      feedback: [{ id: 'f', requestId: 'r', stageId: 's', stageLabel: 'Tecnico', interviewerName: 'Ada', answers: [{ questionId: 'q', question: 'Q?', answer: 'A' }], recommendation: 'proceed', submittedAt: at }],
    });
    expect(parsed.requests[0]?.status).toBe('expired');
  });

  it('refuses the shapes the old web accepted (state, nested interviewer)', () => {
    expect(applicationFeedbackSchema.safeParse({ requests: [{ id: 'r', state: 'overdue' }], feedback: [] }).success).toBe(false);
  });

  it('reads the public page with and without a submission', () => {
    const page = { organizationName: 'Acme', language: 'it', interviewerName: 'Ada', candidate: { firstName: 'A', lastName: 'B' }, jobTitle: 'Dev', stage: { label: 'HR', note: null }, questions: [{ id: 'q', label: 'Q', required: true }], recommendations: ['proceed'], hasCv: false, expiresAt: at, submission: null };
    expect(publicFeedbackSchema.safeParse(page).success).toBe(true);
    expect(publicFeedbackSchema.parse({ ...page, submission: { answers: { q: 'x' }, recommendation: 'discuss', submittedAt: at } }).submission?.recommendation).toBe('discuss');
    expect(publicFeedbackSchema.safeParse({ ...page, language: 'fr' }).success).toBe(false);
  });
});
