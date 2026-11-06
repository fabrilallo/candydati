import { describe, expect, it } from 'vitest';
import { createSourcingFingerprint } from './sourcing-fingerprint.js';

describe('sourcing fingerprint', () => {
  it('is stable, hides the value and differs per organization and secret', () => {
    const print = createSourcingFingerprint('a'.repeat(32));
    expect(print('org_a', 'linkedin.com/in/maja')).toBe(print('org_a', 'linkedin.com/in/maja'));
    expect(print('org_a', 'linkedin.com/in/maja')).not.toContain('maja');
    expect(print('org_a', 'x')).not.toBe(print('org_b', 'x'));
    expect(createSourcingFingerprint('b'.repeat(32))('org_a', 'x')).not.toBe(print('org_a', 'x'));
  });
});
