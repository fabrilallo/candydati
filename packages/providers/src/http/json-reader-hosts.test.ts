import { describe, expect, it } from 'vitest';
import { checkTarget, hostMatches, hostRuleFor } from './json-reader-hosts.js';
import { JsonReaderError } from './json-reader-errors.js';
import { redactHeaders, redactUrl } from './redact.js';
import { backoffMs, createTokenBucket, exhaustedWindowMs, retryAfterMs } from './json-reader-rate.js';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof JsonReaderError ? error.code : 'other';
  }
};

describe('host rules', () => {
  it('accepts plain DNS names of two labels or more, refuses everything else at creation', () => {
    expect(hostRuleFor({ exact: 'api.teamtailor.com' })).toEqual({ exact: 'api.teamtailor.com' });
    expect(hostRuleFor({ subdomainOf: 'workable.com' })).toEqual({ subdomainOf: 'workable.com' });
    for (const bad of ['com', '', 'API.example.com', 'https://api.example.com', 'api.example.com.', '127.0.0.1', '*.example.com', 'a..b', '-a.example.com', 'x'.repeat(64) + '.com']) {
      expect(() => hostRuleFor({ exact: bad }), bad).toThrow();
      expect(() => hostRuleFor({ subdomainOf: bad }), bad).toThrow();
    }
  });

  it('matches exactly one extra label for a subdomain rule', () => {
    const rule = { subdomainOf: 'workable.com' };
    expect(hostMatches('acme.workable.com', rule)).toBe(true);
    expect(hostMatches('acme-2.workable.com', rule)).toBe(true);
    for (const host of ['workable.com', 'a.b.workable.com', '-x.workable.com', 'x-.workable.com', 'acme.workable.com.evil.com', 'evilworkable.com', '.workable.com']) {
      expect(hostMatches(host, rule), host).toBe(false);
    }
    expect(hostMatches('api.teamtailor.com', { exact: 'api.teamtailor.com' })).toBe(true);
    expect(hostMatches('x.api.teamtailor.com', { exact: 'api.teamtailor.com' })).toBe(false);
  });

  it('checks a URL: https, default port, no user info, no trailing dot, an allowed host', () => {
    const rules = [{ exact: 'api.teamtailor.com' }, { subdomainOf: 'workable.com' }];
    expect(checkTarget('https://api.teamtailor.com/v1/jobs?page=2', rules, false)).toMatchObject({ host: 'api.teamtailor.com', port: 443, secure: true });
    expect(checkTarget('https://API.Teamtailor.com/v1', rules, false).host).toBe('api.teamtailor.com');
    expect(checkTarget('https://acme.workable.com/spi/v3/jobs', rules, false).host).toBe('acme.workable.com');
    for (const url of [
      'http://api.teamtailor.com/v1', 'https://api.teamtailor.com:8443/v1', 'https://user:pw@api.teamtailor.com/', 'https://api.teamtailor.com./v1',
      'https://evil.com/', 'https://127.0.0.1/', 'https://[::1]/', 'ftp://api.teamtailor.com/', 'not a url', 'https://a.b.workable.com/',
    ]) {
      expect(codeOf(() => checkTarget(url, rules, false)), url).toBe('host_not_allowed');
    }
    expect(checkTarget('http://api.teamtailor.com:8080/v1', rules, true)).toMatchObject({ port: 8080, secure: false });
    expect(codeOf(() => checkTarget('http://evil.com:8080/', rules, true))).toBe('host_not_allowed');
  });
});

describe('redaction', () => {
  it('drops user info and every query value', () => {
    expect(redactUrl('https://u:p@api.example.com/v1/jobs?api_key=SECRET&page=2')).toBe('https://api.example.com/v1/jobs?api_key=REDACTED&page=REDACTED');
    expect(redactUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1');
    expect(redactUrl('::nope')).toBe('REDACTED');
  });

  it('hides credential headers', () => {
    expect(redactHeaders({ Authorization: 'Token token=abc', 'X-Api-Version': '20240404', 'x-auth-token': 't', Cookie: 'c', 'X-Client-Secret': 's', accept: ['a', 'b'], gone: undefined })).toEqual({
      Authorization: 'REDACTED', 'X-Api-Version': '20240404', 'x-auth-token': 'REDACTED', Cookie: 'REDACTED', 'X-Client-Secret': 'REDACTED', accept: 'a, b',
    });
  });
});

describe('rate helpers', () => {
  it('reads Retry-After as seconds or an HTTP date', () => {
    const now = Date.parse('2026-10-16T10:00:00Z');
    expect(retryAfterMs({ 'retry-after': '7' }, now)).toBe(7000);
    expect(retryAfterMs({ 'retry-after': 'Fri, 16 Oct 2026 10:00:05 GMT' }, now)).toBe(5000);
    expect(retryAfterMs({ 'retry-after': 'Fri, 16 Oct 2026 09:00:05 GMT' }, now)).toBe(0);
    expect(retryAfterMs({ 'retry-after': 'soon' }, now)).toBeUndefined();
    expect(retryAfterMs({}, now)).toBeUndefined();
  });

  it('waits for a spent window, with delta or epoch resets, under both header spellings', () => {
    const now = 1_800_000_000_000;
    expect(exhaustedWindowMs({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '3' }, now)).toBe(3000);
    expect(exhaustedWindowMs({ 'x-rate-limit-remaining': '0', 'x-rate-limit-reset': '1800000010' }, now)).toBe(10_000);
    expect(exhaustedWindowMs({ 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': '3', 'x-ratelimit-limit': '10' }, now)).toBeUndefined();
    expect(exhaustedWindowMs({ 'x-ratelimit-remaining': '0' }, now)).toBeUndefined();
    expect(exhaustedWindowMs({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'later' }, now)).toBeUndefined();
    expect(exhaustedWindowMs({ 'x-ratelimit-remaining': 'none', 'x-ratelimit-reset': '3' }, now)).toBeUndefined();
  });

  it('spaces requests with a token bucket and refuses a bad rate', () => {
    let now = 0;
    const take = createTokenBucket({ capacity: 2, refillPerSecond: 1 }, () => now);
    expect([take(), take(), take(), take()]).toEqual([0, 0, 1000, 2000]);
    now = 10_000;
    expect(take()).toBe(0);
    expect(() => createTokenBucket({ capacity: 0, refillPerSecond: 1 }, () => 0)).toThrow();
    expect(() => createTokenBucket({ capacity: 1, refillPerSecond: 0 }, () => 0)).toThrow();
  });

  it('backs off exponentially with jitter, capped', () => {
    expect(backoffMs({ baseMs: 100, maxMs: 1000 }, 1, () => 1)).toBe(100);
    expect(backoffMs({ baseMs: 100, maxMs: 1000 }, 3, () => 0)).toBe(200);
    expect(backoffMs({ baseMs: 100, maxMs: 1000 }, 10, () => 1)).toBe(1000);
  });
});
