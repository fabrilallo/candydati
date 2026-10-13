import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETENTION_DAYS,
  PRIVACY_TEXT_MAX,
  privacyNoticeInputSchema,
  RETENTION_MAX_DAYS,
  RETENTION_MIN_DAYS,
  retentionExpiry,
} from './privacy.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_TEXT = `${'Trattiamo i tuoi dati solo per la selezione. '.repeat(9)}Grazie.`;

const validInput = {
  language: 'it',
  text: LONG_TEXT,
  contactEmail: 'privacy@example.com',
  retentionDays: { selection: 365, talent_pool: 730 },
} as const;

describe('privacyNoticeInputSchema', () => {
  it('accepts a complete notice', () => {
    expect(privacyNoticeInputSchema.parse(validInput)).toEqual(validInput);
  });

  it('accepts both supported locales', () => {
    expect(privacyNoticeInputSchema.safeParse({ ...validInput, language: 'en' }).success).toBe(true);
    expect(privacyNoticeInputSchema.safeParse({ ...validInput, language: 'fr' }).success).toBe(false);
  });

  it('trims the text and rejects text shorter than 200 characters after trimming', () => {
    const padded = `   ${'a'.repeat(199)}   `;
    expect(privacyNoticeInputSchema.safeParse({ ...validInput, text: padded }).success).toBe(false);
    const exact = privacyNoticeInputSchema.parse({ ...validInput, text: `  ${'a'.repeat(200)}  ` });
    expect(exact.text).toBe('a'.repeat(200));
  });

  it('rejects text longer than the maximum', () => {
    expect(privacyNoticeInputSchema.safeParse({ ...validInput, text: 'a'.repeat(PRIVACY_TEXT_MAX) }).success).toBe(true);
    expect(privacyNoticeInputSchema.safeParse({ ...validInput, text: 'a'.repeat(PRIVACY_TEXT_MAX + 1) }).success).toBe(false);
  });

  it('rejects an invalid contact email', () => {
    expect(privacyNoticeInputSchema.safeParse({ ...validInput, contactEmail: 'not-an-email' }).success).toBe(false);
  });

  it('accepts retention at the bounds and rejects values outside them', () => {
    const withRetention = (selection: number, talent_pool = 730) => ({
      ...validInput,
      retentionDays: { selection, talent_pool },
    });
    expect(privacyNoticeInputSchema.safeParse(withRetention(RETENTION_MIN_DAYS)).success).toBe(true);
    expect(privacyNoticeInputSchema.safeParse(withRetention(RETENTION_MAX_DAYS)).success).toBe(true);
    expect(privacyNoticeInputSchema.safeParse(withRetention(RETENTION_MIN_DAYS - 1)).success).toBe(false);
    expect(privacyNoticeInputSchema.safeParse(withRetention(RETENTION_MAX_DAYS + 1)).success).toBe(false);
    expect(privacyNoticeInputSchema.safeParse(withRetention(365.5)).success).toBe(false);
    expect(privacyNoticeInputSchema.safeParse({ ...validInput, retentionDays: { selection: 365, talent_pool: 10 } }).success).toBe(
      false,
    );
  });

  it('keeps the default retention periods inside the bounds', () => {
    for (const days of Object.values(DEFAULT_RETENTION_DAYS)) {
      expect(days).toBeGreaterThanOrEqual(RETENTION_MIN_DAYS);
      expect(days).toBeLessThanOrEqual(RETENTION_MAX_DAYS);
    }
  });
});

describe('retentionExpiry', () => {
  const givenAt = new Date('2026-01-01T00:00:00.000Z');
  const notice = { retentionDays: { selection: 100, talent_pool: 400 } };

  it('counts the selection retention from consent when only selection is consented', () => {
    const expiry = retentionExpiry({ scopes: ['selection'], givenAt }, notice);
    expect(expiry.getTime()).toBe(givenAt.getTime() + 100 * DAY_MS);
  });

  it('uses the longest consented scope when talent pool is also consented', () => {
    const expiry = retentionExpiry({ scopes: ['selection', 'talent_pool'], givenAt }, notice);
    expect(expiry.getTime()).toBe(givenAt.getTime() + 400 * DAY_MS);
  });

  it('uses the talent pool retention when it is the only consented scope', () => {
    const expiry = retentionExpiry({ scopes: ['talent_pool'], givenAt }, notice);
    expect(expiry.getTime()).toBe(givenAt.getTime() + 400 * DAY_MS);
  });

  it('does not depend on the order of the scopes', () => {
    const forward = retentionExpiry({ scopes: ['selection', 'talent_pool'], givenAt }, notice);
    const backward = retentionExpiry({ scopes: ['talent_pool', 'selection'], givenAt }, notice);
    expect(backward).toEqual(forward);
  });

  it('returns a new Date and leaves givenAt untouched', () => {
    const expiry = retentionExpiry({ scopes: ['selection'], givenAt }, notice);
    expect(expiry).not.toBe(givenAt);
    expect(givenAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('refuses to compute a retention without any consent scope', () => {
    expect(() => retentionExpiry({ scopes: [], givenAt: new Date(0) }, { retentionDays: { selection: 365, talent_pool: 730 } })).toThrow();
  });
});
