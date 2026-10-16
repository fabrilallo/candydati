import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAX, pickOrigin, sanitizeCampaign, sanitizeOrigin, ORIGIN_MAX } from './origin.js';

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

describe('sanitizeCampaign', () => {
  it('uses the origin rules: lowercase, safe characters, at most 60', () => {
    expect(sanitizeCampaign('Autumn 2026!')).toBe('autumn-2026');
    expect(sanitizeCampaign('x'.repeat(200))).toHaveLength(CAMPAIGN_MAX);
  });
  it('reduces a URL to its host', () => {
    expect(sanitizeCampaign('https://www.example.org/a?b=1')).toBe('example.org');
  });
  it('is the empty string, not direct, for no campaign or personal data', () => {
    for (const value of [undefined, null, 7, '', '  ', '---', 'mario.rossi@example.org']) expect(sanitizeCampaign(value)).toBe('');
  });
});
