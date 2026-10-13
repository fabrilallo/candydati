import { describe, expect, it } from 'vitest';
import { apiKeyInputSchema, formatApiKeySecret, isApiKeySecret, parseApiKeySecret } from './api-key.js';

const RANDOM = 'a'.repeat(32);

describe('apiKeyInputSchema', () => {
  it('trims the name, dedupes the scopes and coerces the expiry', () => {
    const parsed = apiKeyInputSchema.parse({ name: '  CI  ', scopes: ['job:read', 'job:read'], expiresAt: '2030-01-01T00:00:00Z' });
    expect(parsed.name).toBe('CI');
    expect(parsed.scopes).toEqual(['job:read']);
    expect(parsed.expiresAt).toEqual(new Date('2030-01-01T00:00:00Z'));
  });

  it('allows no expiry', () => {
    expect(apiKeyInputSchema.parse({ name: 'x', scopes: ['job:read'] }).expiresAt).toBeUndefined();
  });

  it('rejects empty names, no scopes, unknown scopes and bad dates', () => {
    expect(apiKeyInputSchema.safeParse({ name: ' ', scopes: ['job:read'] }).success).toBe(false);
    expect(apiKeyInputSchema.safeParse({ name: 'x', scopes: [] }).success).toBe(false);
    expect(apiKeyInputSchema.safeParse({ name: 'x', scopes: ['job:fly'] }).success).toBe(false);
    expect(apiKeyInputSchema.safeParse({ name: 'x', scopes: ['job:read'], expiresAt: 'soon' }).success).toBe(false);
  });
});

describe('api key secret', () => {
  it('formats and parses the prefix', () => {
    const secret = formatApiKeySecret('Ab12Cd34', RANDOM);
    expect(secret).toBe(`tt_Ab12Cd34_${RANDOM}`);
    expect(parseApiKeySecret(secret)).toEqual({ prefix: 'Ab12Cd34' });
    expect(isApiKeySecret(secret)).toBe(true);
  });

  it('refuses malformed secrets', () => {
    for (const bad of ['', 'tt_short_x', `xx_Ab12Cd34_${RANDOM}`, `tt_Ab12Cd34_${RANDOM}!`, `tt_Ab12Cd3_${RANDOM}`]) {
      expect(parseApiKeySecret(bad)).toBeNull();
    }
    expect(isApiKeySecret(42)).toBe(false);
  });
});
