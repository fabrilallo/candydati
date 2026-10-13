import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUST_PROXY, parseTrustProxy } from './trust-proxy.js';

describe('parseTrustProxy', () => {
  it('trusts only loopback by default', () => {
    expect(parseTrustProxy(undefined)).toEqual(DEFAULT_TRUST_PROXY);
    expect(parseTrustProxy('')).toEqual(['loopback']);
    expect(parseTrustProxy('  ')).toEqual(['loopback']);
  });

  it('accepts a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('accepts a comma-separated list of addresses, CIDRs and named ranges', () => {
    expect(parseTrustProxy('10.0.0.0/8, 172.18.0.2,::1,uniquelocal')).toEqual(['10.0.0.0/8', '172.18.0.2', '::1', 'uniquelocal']);
  });

  it.each(['true', '0', '-1', 'abc', '10.0.0.0/99', '1.2.3', '10.0.0.1,,', '*'])('refuses %j (never "trust everyone")', (value) => {
    expect(() => parseTrustProxy(value)).toThrow(/TRUST_PROXY/);
  });
});
