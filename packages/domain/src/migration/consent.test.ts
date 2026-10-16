import { describe, expect, it } from 'vitest';
import { migrationConsentOf } from './consent.js';

const NOW = new Date('2026-10-16T00:00:00Z');
const notice = { retentionDays: { selection: 365, talent_pool: 730 } };

describe('migrationConsentOf', () => {
  it('sends a person without a consent date to the reconfirmation', () => {
    expect(migrationConsentOf({}, notice, NOW)).toEqual({ bucket: 'to_renew', givenAt: null, expiresAt: null });
  });

  it('keeps the source expiry when there is one', () => {
    const consent = { givenAt: '2025-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' };
    expect(migrationConsentOf({ consent }, notice, NOW)).toEqual({
      bucket: 'given',
      givenAt: new Date('2025-01-01T00:00:00Z'),
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
  });

  it('counts the retention of the active notice from the consent date, selection only when no scope is given', () => {
    const decision = migrationConsentOf({ consent: { givenAt: '2026-01-01T00:00:00Z' } }, notice, NOW);
    expect(decision).toEqual({ bucket: 'given', givenAt: new Date('2026-01-01T00:00:00Z'), expiresAt: new Date('2027-01-01T00:00:00Z') });
  });

  it('uses the longest retention among the scopes', () => {
    const decision = migrationConsentOf({ consent: { givenAt: '2025-01-01T00:00:00Z', scopes: ['selection', 'talent_pool'] } }, notice, NOW);
    expect(decision.bucket).toBe('given');
    expect(decision.expiresAt).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  it('marks as expired a retention that ended before now (source expiry or notice)', () => {
    expect(migrationConsentOf({ consent: { givenAt: '2020-01-01T00:00:00Z', expiresAt: '2021-01-01T00:00:00Z' } }, notice, NOW).bucket).toBe('expired');
    expect(migrationConsentOf({ consent: { givenAt: '2024-01-01T00:00:00Z' } }, notice, NOW).bucket).toBe('expired');
    expect(migrationConsentOf({ consent: { givenAt: '2020-01-01T00:00:00Z', expiresAt: NOW.toISOString() } }, notice, NOW).bucket).toBe('expired');
  });

  it('cannot count a retention without a notice: given, expiry unknown', () => {
    expect(migrationConsentOf({ consent: { givenAt: '2020-01-01T00:00:00Z' } }, null, NOW)).toEqual({
      bucket: 'given',
      givenAt: new Date('2020-01-01T00:00:00Z'),
      expiresAt: null,
    });
  });
});
