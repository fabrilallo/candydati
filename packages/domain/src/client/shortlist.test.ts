import { describe, expect, it } from 'vitest';
import { buildProfileSharedNotice, buildShortlistEmail } from './emails.js';
import { constantTimeEqual, SHORTLIST_CANDIDATES_MAX, shortlistAnswerSchema, shortlistInputSchema, shortlistPath, shortlistStatus } from './shortlist.js';

const NOW = new Date('2026-06-01T10:00:00Z');
const LATER = new Date('2026-06-15T10:00:00Z');

describe('shortlistInputSchema', () => {
  it('defaults to no CV and no notes, and turns a blank message into null', () => {
    expect(shortlistInputSchema.parse({ jobId: 'job_1', contactId: 'c1', message: '  ', candidates: [{ applicationId: 'app_1' }] })).toEqual({
      jobId: 'job_1',
      contactId: 'c1',
      message: null,
      candidates: [{ applicationId: 'app_1', shareCv: false, noteIds: [] }],
    });
  });

  it('refuses an empty list, duplicates, too many candidates and unknown fields', () => {
    const base = { jobId: 'job_1', contactId: 'c1' };
    expect(shortlistInputSchema.safeParse({ ...base, candidates: [] }).success).toBe(false);
    expect(shortlistInputSchema.safeParse({ ...base, candidates: [{ applicationId: 'a' }, { applicationId: 'a' }] }).success).toBe(false);
    const many = Array.from({ length: SHORTLIST_CANDIDATES_MAX + 1 }, (_, i) => ({ applicationId: `a${i}` }));
    expect(shortlistInputSchema.safeParse({ ...base, candidates: many }).success).toBe(false);
    expect(shortlistInputSchema.safeParse({ ...base, candidates: [{ applicationId: 'a', score: 5 }] }).success).toBe(false);
  });
});

describe('shortlistAnswerSchema', () => {
  it('requires a short reason and one of the two answers, nothing else', () => {
    expect(shortlistAnswerSchema.parse({ itemId: 'i1', answer: 'meet', reason: ' Strong background ' }).reason).toBe('Strong background');
    expect(shortlistAnswerSchema.safeParse({ itemId: 'i1', answer: 'meet', reason: '  ' }).success).toBe(false);
    expect(shortlistAnswerSchema.safeParse({ itemId: 'i1', answer: 'hire', reason: 'Great fit' }).success).toBe(false);
    expect(shortlistAnswerSchema.safeParse({ itemId: 'i1', answer: 'meet', reason: 'ok fine', rating: 5 }).success).toBe(false);
  });
});

describe('shortlistStatus', () => {
  const open = { expiresAt: LATER, revokedAt: null };
  it('is revoked first, then answered when every candidate has an answer, then expired or open', () => {
    expect(shortlistStatus({ ...open, revokedAt: NOW }, [{ answer: 'meet' }], NOW)).toBe('revoked');
    expect(shortlistStatus(open, [{ answer: 'meet' }, { answer: 'not_for_us' }], NOW)).toBe('answered');
    expect(shortlistStatus(open, [{ answer: 'meet' }, { answer: null }], NOW)).toBe('open');
    expect(shortlistStatus(open, [{ answer: null }], LATER)).toBe('expired');
  });
});

describe('constantTimeEqual and shortlistPath', () => {
  it('compares whole strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(shortlistPath('tok')).toBe('/shortlist/tok');
  });
});

describe('buildShortlistEmail', () => {
  const input = {
    recipientName: 'Carla',
    agencyName: 'Selezioni Test',
    jobTitle: 'Backend developer',
    candidateCount: 2,
    message: 'Two strong profiles.',
    link: 'https://x.example/shortlist/t',
    expiresAt: LATER,
    reminder: false,
  } as const;

  it('carries the link, the deadline and the message, in both languages', () => {
    const italian = buildShortlistEmail({ ...input, locale: 'it' });
    expect(italian.subject).toBe('Selezioni Test ti presenta 2 candidati per Backend developer');
    expect(italian.text).toContain('https://x.example/shortlist/t');
    expect(italian.text).toContain('Two strong profiles.');
    expect(italian.text).toContain('15 giugno 2026');
    const english = buildShortlistEmail({ ...input, locale: 'en', candidateCount: 1, message: null, reminder: true });
    expect(english.subject).toBe('Reminder: Selezioni Test presents a candidate for Backend developer');
    expect(english.text).toContain('replaces the one you received before');
  });
});

describe('buildProfileSharedNotice', () => {
  const input = { candidateFirstName: 'Mario', agencyName: 'Selezioni Test', jobTitle: 'Accountant', sharedCv: true, sharedNotes: false } as const;

  it('names the client when it is shown, and says what was shared', () => {
    const notice = buildProfileSharedNotice({ ...input, locale: 'it', clientName: 'Acme' });
    expect(notice.subject).toBe('Il tuo profilo per Accountant è stato presentato a Acme');
    expect(notice.text).toContain('a Acme.');
    expect(notice.text).toContain('nome e cognome, il curriculum.');
    expect(notice.text).toContain('Nessuna decisione su di te viene presa in modo automatico');
  });

  it('never invents a name for a confidential client and says how to ask which company it is', () => {
    const italian = buildProfileSharedNotice({ ...input, locale: 'it', clientName: null });
    expect(italian.text).toContain("un'azienda cliente di Selezioni Test");
    expect(italian.text).toContain('Se vuoi sapere a quale azienda');
    const english = buildProfileSharedNotice({ ...input, locale: 'en', clientName: null, sharedCv: false, sharedNotes: true });
    expect(english.subject).toBe('Your profile for Accountant was presented to the client company');
    expect(english.text).toContain("your name, some of the recruiter's notes on your profile.");
    expect(english.text).toContain('If you would like to know which company it is');
    expect(buildProfileSharedNotice({ ...input, locale: 'en', clientName: 'Acme' }).text).not.toContain('which company');
  });
});
