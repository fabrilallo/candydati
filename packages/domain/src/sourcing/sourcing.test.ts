import { describe, expect, it } from 'vitest';
import { contactExpiry, normalizeProfileUrl, sourcedContactInputSchema, SOURCED_CONTACT_RETENTION_DAYS } from './sourcing.js';

describe('normalizeProfileUrl', () => {
  it('reduces a LinkedIn or GitHub profile to one key, whatever the form of the link', () => {
    expect(normalizeProfileUrl('https://www.linkedin.com/in/Mario-Rossi-123/?originalSubdomain=it')).toBe('linkedin.com/in/mario-rossi-123');
    expect(normalizeProfileUrl('http://it.linkedin.com/in/mario-rossi-123/details/experience/')).toBe('linkedin.com/in/mario-rossi-123');
    expect(normalizeProfileUrl('https://github.com/MRossi/')).toBe('github.com/mrossi');
    expect(normalizeProfileUrl('https://github.com/MRossi/some-repo')).toBe('github.com/mrossi');
    expect(normalizeProfileUrl('https://mario.dev/about/#me')).toBe('mario.dev/about');
  });

  it('refuses what is not an http(s) link', () => {
    expect(normalizeProfileUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeProfileUrl('not a url')).toBeNull();
  });
});

describe('sourcedContactInputSchema', () => {
  const base = { firstName: 'Maja', lastName: 'Lind', source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/maja-lind' };

  it('takes a found person with evidence per criterion, trimmed', () => {
    const parsed = sourcedContactInputSchema.parse({ ...base, headline: ' Backend engineer ', evidence: [{ criterion: 'Go', text: '4 years of Go at Spotify', where: 'experience' }] });
    expect(parsed).toMatchObject({ headline: 'Backend engineer', location: null, email: null, evidence: [{ criterion: 'Go', text: '4 years of Go at Spotify', where: 'experience' }] });
  });

  it('refuses an unknown source, a link that is not a profile link and too much evidence', () => {
    expect(sourcedContactInputSchema.safeParse({ ...base, source: 'facebook' }).success).toBe(false);
    expect(sourcedContactInputSchema.safeParse({ ...base, profileUrl: 'ftp://x' }).success).toBe(false);
    expect(sourcedContactInputSchema.safeParse({ ...base, evidence: Array.from({ length: 21 }, () => ({ criterion: 'Go', text: 'x' })) }).success).toBe(false);
  });

  it('never carries a score', () => {
    expect(sourcedContactInputSchema.safeParse({ ...base, score: 9 }).success).toBe(false);
  });
});

describe('contactExpiry', () => {
  it('is 30 days after the data was collected', () => {
    expect(SOURCED_CONTACT_RETENTION_DAYS).toBe(30);
    expect(contactExpiry(new Date('2026-11-06T10:00:00Z')).toISOString()).toBe('2026-12-06T10:00:00.000Z');
  });
});
