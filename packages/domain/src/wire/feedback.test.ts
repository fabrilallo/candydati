import { describe, expect, it } from 'vitest';
import { applicationFeedbackSchema, criterionObservationWireSchema, jobScorecardSchema, publicFeedbackSchema, stageInterviewersSchema, suggestScorecardResultSchema } from './feedback.js';

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

  it('carries scorecard observations as words with evidence and refuses any number', () => {
    const at = '2026-05-01T00:00:00.000Z';
    const parsed = applicationFeedbackSchema.parse({
      requests: [],
      feedback: [],
      scorecard: [{ criterionId: 'c', label: 'English B2', entries: [{ feedbackId: 'f', interviewerName: 'Ada', stageId: 's', stageLabel: 'HR', observation: 'to_explore', evidence: 'Short answers', submittedAt: at }] }],
    });
    expect(parsed.scorecard[0]?.entries[0]?.observation).toBe('to_explore');
    expect(criterionObservationWireSchema.safeParse({ criterionId: 'c', label: 'x', observation: 4, evidence: 'e' }).success).toBe(false);
    expect(jobScorecardSchema.parse({ jobId: 'j', criteria: [{ id: 'c', label: 'Postgres', stageId: null, position: 0, locked: true }] }).criteria[0]?.locked).toBe(true);
    expect(suggestScorecardResultSchema.parse({ status: 'proposed', criteria: ['Postgres'] }).criteria).toEqual(['Postgres']);
  });
});
