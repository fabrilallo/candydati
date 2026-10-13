import { describe, expect, it } from 'vitest';
import { STAGE_TYPES } from '../job/taxonomy.js';
import {
  buildFeedbackEmail,
  checkAnswers,
  feedbackRequestStatus,
  feedbackSubmissionSchema,
  FEEDBACK_ANSWER_MAX,
  interviewerInputSchema,
} from './feedback.js';
import { FEEDBACK_TEMPLATES, feedbackQuestionsFor, localizeQuestions } from './templates.js';

describe('feedback templates', () => {
  it('has a form for every stage type with unique ids and both languages, and never asks for a score', () => {
    for (const type of STAGE_TYPES) {
      const questions = FEEDBACK_TEMPLATES[type];
      expect(questions.length).toBeGreaterThanOrEqual(2);
      expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);
      for (const question of questions) {
        expect(question.it.length).toBeGreaterThan(3);
        expect(question.en.length).toBeGreaterThan(3);
        expect(`${question.it} ${question.en}`.toLowerCase()).not.toMatch(/voto|punteggio|score|rating|\bgrade\b/);
      }
    }
  });

  it('asks the technical questions for a technical interview, in the requested language', () => {
    expect(localizeQuestions(feedbackQuestionsFor('technical_interview'), 'it').map((q) => q.label)).toEqual([
      'Cosa ha mostrato sul piano tecnico',
      'Cosa resta da approfondire',
      'Domande e dubbi del candidato',
    ]);
    expect(localizeQuestions(feedbackQuestionsFor('technical_interview'), 'en')[0]?.label).toBe('What they showed on the technical side');
  });

  it('falls back to a generic form when the stage no longer exists', () => {
    expect(feedbackQuestionsFor(null).map((q) => q.id)).toEqual(['general_shown', 'general_open']);
  });
});

describe('feedbackSubmissionSchema', () => {
  const valid = { answers: { tech_shown: 'Solid' }, recommendation: 'proceed' };

  it('accepts the three recommendations', () => {
    for (const recommendation of ['proceed', 'do_not_proceed', 'discuss']) {
      expect(feedbackSubmissionSchema.safeParse({ ...valid, recommendation }).success).toBe(true);
    }
    expect(feedbackSubmissionSchema.safeParse({ ...valid, recommendation: 'hire' }).success).toBe(false);
  });

  it('refuses any score, rating or unknown field', () => {
    for (const extra of [{ score: 4 }, { rating: 'A' }, { overall: 3 }]) {
      expect(feedbackSubmissionSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });

  it('caps the length of an answer', () => {
    expect(feedbackSubmissionSchema.safeParse({ ...valid, answers: { tech_shown: 'x'.repeat(FEEDBACK_ANSWER_MAX) } }).success).toBe(true);
    expect(feedbackSubmissionSchema.safeParse({ ...valid, answers: { tech_shown: 'x'.repeat(FEEDBACK_ANSWER_MAX + 1) } }).success).toBe(false);
  });
});

describe('checkAnswers', () => {
  it('reports unknown questions and blank required ones, and trims what it keeps', () => {
    const result = checkAnswers('technical_interview', { tech_shown: '  ok ', tech_open: '   ', candidate_questions: '', score: '5' });
    expect(result.issues).toEqual([
      { path: 'answers.score', message: 'unknown_question' },
      { path: 'answers.tech_open', message: 'required' },
    ]);
    expect(result.answers).toEqual({ tech_shown: 'ok' });
  });

  it('is clean when the required questions are answered', () => {
    expect(checkAnswers('technical_interview', { tech_shown: 'a', tech_open: 'b' }).issues).toEqual([]);
  });
});

describe('interviewerInputSchema', () => {
  it('needs a user for a member and an email and name for an external person', () => {
    expect(interviewerInputSchema.safeParse({ kind: 'member', userId: 'u1' }).success).toBe(true);
    expect(interviewerInputSchema.safeParse({ kind: 'member' }).success).toBe(false);
    expect(interviewerInputSchema.safeParse({ kind: 'external', email: 'a@b.it', name: 'Ada' }).success).toBe(true);
    expect(interviewerInputSchema.safeParse({ kind: 'external', email: 'a@b.it' }).success).toBe(false);
    expect(interviewerInputSchema.safeParse({ kind: 'external', name: 'Ada' }).success).toBe(false);
  });
});

describe('feedbackRequestStatus and email', () => {
  const now = new Date('2026-06-10T00:00:00Z');
  it('is submitted, expired or pending', () => {
    expect(feedbackRequestStatus({ submittedAt: now, expiresAt: new Date('2026-06-01T00:00:00Z') }, now)).toBe('submitted');
    expect(feedbackRequestStatus({ submittedAt: null, expiresAt: now }, now)).toBe('expired');
    expect(feedbackRequestStatus({ submittedAt: null, expiresAt: new Date('2026-06-11T00:00:00Z') }, now)).toBe('pending');
  });

  it('writes the request in the language of the ad and says it is not a score', () => {
    const base = { interviewerName: 'Ada', candidateName: 'Mario Rossi', jobTitle: 'Backend', stageLabel: 'Colloquio', organizationName: 'Acme', link: 'https://x.test/feedback/t', expiresAt: now, reminder: false };
    const it = buildFeedbackEmail({ ...base, locale: 'it' });
    expect(it.subject).toBe('Feedback su Mario Rossi per Backend');
    expect(it.text).toContain('https://x.test/feedback/t');
    expect(it.text).toContain('non dà un voto');
    const en = buildFeedbackEmail({ ...base, locale: 'en', reminder: true });
    expect(en.subject).toBe('Reminder: Feedback on Mario Rossi for Backend');
    expect(en.text).toContain('does not score');
  });
});
