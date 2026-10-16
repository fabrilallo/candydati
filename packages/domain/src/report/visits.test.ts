import { describe, expect, it } from 'vitest';
import { isBotUserAgent, jobViewQuerySchema, viewDay, viewLabels, viewRetentionCutoff } from './visits.js';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('isBotUserAgent', () => {
  it('lets real browsers through', () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
    expect(isBotUserAgent(IPHONE)).toBe(false);
  });
  it('refuses crawlers, previewers, headless browsers and scripts', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0)',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0 Safari/537.36',
      'LinkedInBot/1.0',
      'Slackbot-LinkExpanding 1.0',
      'curl/8.4.0',
      'python-requests/2.31',
      'Go-http-client/2.0',
      'Pingdom.com_bot_version_1.4',
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
  });
  it('treats a missing user agent as not a browser', () => {
    for (const ua of [undefined, null, '', '   ']) expect(isBotUserAgent(ua)).toBe(true);
  });
});

describe('viewLabels', () => {
  it('sanitizes both labels with the application rules', () => {
    expect(viewLabels({ source: 'LinkedIn', campaign: 'Autumn 2026' })).toEqual({ source: 'linkedin', campaign: 'autumn-2026' });
  });
  it('falls back to direct and no campaign', () => {
    expect(viewLabels({})).toEqual({ source: 'direct', campaign: '' });
    expect(viewLabels({ source: 'a@b.it', campaign: 'a@b.it' })).toEqual({ source: 'direct', campaign: '' });
  });
});

describe('jobViewQuerySchema', () => {
  it('accepts nothing, or short strings', () => {
    expect(jobViewQuerySchema.safeParse({}).success).toBe(true);
    expect(jobViewQuerySchema.safeParse({ source: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('viewDay and retention', () => {
  it('counts under the UTC day', () => {
    expect(viewDay(new Date('2026-10-16T23:59:59Z'))).toBe('2026-10-16');
  });
  it('keeps 25 calendar months', () => {
    expect(viewRetentionCutoff(new Date('2026-10-16T10:00:00Z'))).toBe('2024-09-16');
    expect(viewRetentionCutoff(new Date('2026-02-10T10:00:00Z'), 12)).toBe('2025-02-10');
  });
});
