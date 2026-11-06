import { describe, expect, it } from 'vitest';
import { buildSourcingNotice, sourcingNoticePath } from './notice.js';

const input = {
  firstName: 'Maja',
  organizationName: 'Acme',
  jobTitle: 'Backend Developer',
  source: 'linkedin' as const,
  link: 'https://app.example/sourcing/notice/s3cret',
  expiresAt: new Date('2026-12-06T10:00:00Z'),
  timeZone: 'Europe/Rome',
};

describe('art. 14 notice to a sourced contact', () => {
  it('says who, from where, why, until when, and how to have the data erased (Italian)', () => {
    const { subject, text } = buildSourcingNotice({ ...input, locale: 'it' });
    expect(subject).toBe('Acme ha trovato il tuo profilo per la posizione Backend Developer');
    for (const part of ['Ciao Maja', 'Acme', 'profilo pubblico LinkedIn', 'Backend Developer', '6 dicembre 2026', 'https://app.example/sourcing/notice/s3cret', 'non ricontattarti']) expect(text).toContain(part);
  });

  it('speaks English too, and names a web page or GitHub as the source', () => {
    const { subject, text } = buildSourcingNotice({ ...input, locale: 'en', source: 'github' });
    expect(subject).toBe('Acme found your profile for the Backend Developer role');
    expect(text).toContain('public GitHub profile');
    expect(text).toContain('6 December 2026');
  });

  it('has a short form to paste in a first message', () => {
    const { text } = buildSourcingNotice({ ...input, locale: 'it', short: true });
    expect(text.length).toBeLessThan(400);
    expect(text).toContain('https://app.example/sourcing/notice/s3cret');
  });

  it('builds the public path of the notice page', () => {
    expect(sourcingNoticePath('abc')).toBe('/sourcing/notice/abc');
  });
});
