import { describe, expect, it } from 'vitest';
import { applicationFormSchema } from '../candidate/application.js';
import { candidateCorrectionSchema } from '../candidate/correction.js';
import { httpUrlOrNull, httpUrlSchema, httpsUrlSchema, urlHostIs } from './http-url.js';

describe('httpUrlSchema', () => {
  it('accepts http and https', () => {
    expect(httpUrlSchema.safeParse('https://www.linkedin.com/in/ada').success).toBe(true);
    expect(httpUrlSchema.safeParse('http://example.com/x').success).toBe(true);
  });
  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'ftp://a.example', 'vbscript:x', 'blob:https://a.example/1', ' javascript:alert(1)'])(
    'refuses %s',
    (value) => {
      expect(httpUrlSchema.safeParse(value).success).toBe(false);
    },
  );
  it('https-only variant refuses http', () => {
    expect(httpsUrlSchema.safeParse('http://a.example/logo.png').success).toBe(false);
    expect(httpsUrlSchema.safeParse('https://a.example/logo.png').success).toBe(true);
  });
});

describe('httpUrlOrNull', () => {
  it('returns the normalized link or null', () => {
    expect(httpUrlOrNull('https://a.example/x')).toBe('https://a.example/x');
    expect(httpUrlOrNull('javascript:alert(1)')).toBeNull();
    expect(httpUrlOrNull('nope')).toBeNull();
    expect(httpUrlOrNull(null)).toBeNull();
    expect(httpUrlOrNull('https://a.example/logo.png', { httpsOnly: true })).toBe('https://a.example/logo.png');
    expect(httpUrlOrNull('http://a.example/logo.png', { httpsOnly: true })).toBeNull();
  });
});

describe('user supplied URLs in forms', () => {
  const base = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', consentScopes: ['selection'], privacyNoticeVersion: 1 };
  it('application form refuses a javascript: LinkedIn URL', () => {
    expect(applicationFormSchema.safeParse({ ...base, linkedinUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...base, linkedinUrl: 'https://linkedin.com/in/ada' }).success).toBe(true);
  });
  it('correction refuses a javascript: LinkedIn URL', () => {
    expect(candidateCorrectionSchema.safeParse({ linkedinUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(candidateCorrectionSchema.safeParse({ linkedinUrl: null }).success).toBe(true);
  });
});

describe('urlHostIs', () => {
  it('accepts the domain and its subdomains, by parsed hostname', () => {
    expect(urlHostIs('https://linkedin.com/in/a', 'linkedin.com')).toBe(true);
    expect(urlHostIs('https://IT.LinkedIn.com/in/a', 'linkedin.com')).toBe(true);
  });

  it.each(['https://evil.example/linkedin.com', 'https://linkedin.com.evil.example/', 'https://notlinkedin.com/', 'https://linkedin.com@evil.example/', 'https://evil.example/?linkedin.com', 'not a url', ''])(
    'refuses %s',
    (url) => {
      expect(urlHostIs(url, 'linkedin.com')).toBe(false);
    },
  );
});
