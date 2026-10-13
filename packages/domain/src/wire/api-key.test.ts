import { describe, expect, it } from 'vitest';
import { apiKeyCreatedSchema, apiKeySchema } from './api-key.js';

const key = { id: 'k1', name: 'CI', prefix: 'abcd1234', scopes: ['job:read'], createdBy: 'u1', createdByName: null, createdAt: '2026-05-01T10:00:00.000Z', lastUsedAt: null, expiresAt: null, revokedAt: null };

describe('api key wire schemas', () => {
  it('reads a key and refuses an unknown scope', () => {
    expect(apiKeySchema.parse(key)).toEqual(key);
    expect(apiKeySchema.safeParse({ ...key, scopes: ['job:fly'] }).success).toBe(false);
  });

  it('reads the creation answer with its secret', () => {
    expect(apiKeyCreatedSchema.parse({ key, secret: 'tt_x' }).secret).toBe('tt_x');
    expect(apiKeyCreatedSchema.safeParse({ ...key, secret: 'tt_x' }).success).toBe(false);
  });
});
