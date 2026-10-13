import { describe, expect, it } from 'vitest';
import { ORIGIN_MAX, pickOrigin, sanitizeOrigin } from './origin.js';

describe('sanitizeOrigin', () => {
  it('keeps a short label, lowercased', () => {
    expect(sanitizeOrigin('LinkedIn')).toBe('linkedin');
    expect(sanitizeOrigin('  newsletter_2026 ')).toBe('newsletter_2026');
  });
  it('reduces a URL to its host and never keeps path or query', () => {
    expect(sanitizeOrigin('https://www.Google.com/search?q=mario+rossi&x=1#frag')).toBe('google.com');
    expect(sanitizeOrigin('http://user:pw@example.org:8080/a')).toBe('example.org');
  });
  it('replaces unsafe characters', () => {
    expect(sanitizeOrigin('a b/c<script>')).toBe('a-b-c-script');
  });
  it('falls back to direct for anything empty, not a string or looking like personal data', () => {
    for (const value of [undefined, null, 42, '', '   ', '---', 'mario.rossi@example.org', 'https://']) expect(sanitizeOrigin(value)).toBe('direct');
  });
  it('is at most 60 characters', () => {
    const origin = sanitizeOrigin('x'.repeat(200));
    expect(origin).toHaveLength(ORIGIN_MAX);
  });
});

describe('pickOrigin', () => {
  it('prefers utm_source, then ref, then the referrer host, then direct', () => {
    expect(pickOrigin({ utmSource: 'linkedin', ref: 'x', referrer: 'https://google.com/' })).toBe('linkedin');
    expect(pickOrigin({ ref: 'friend', referrer: 'https://google.com/' })).toBe('friend');
    expect(pickOrigin({ referrer: 'https://www.google.com/search?q=1' })).toBe('google.com');
    expect(pickOrigin({ utmSource: '', referrer: undefined })).toBe('direct');
  });
});
