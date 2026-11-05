import { createSecretBox } from '@candydati/providers';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clearCookie, createSealedCookie, readCookie, serializeCookie } from './sealed-cookie.js';

const SECRET = 'test-secret-test-secret-test-secret-123';
const schema = z.object({ step: z.string() }).strict();

describe('serializeCookie / clearCookie', () => {
  it('writes an HttpOnly, SameSite=Lax cookie scoped to a path, Secure on https', () => {
    expect(serializeCookie('jar', 'v1', { path: '/api/v1/public/linkedin', maxAgeSeconds: 600, secure: true })).toBe(
      'jar=v1; Path=/api/v1/public/linkedin; Max-Age=600; HttpOnly; SameSite=Lax; Secure',
    );
    expect(serializeCookie('jar', 'v1', { path: '/p', maxAgeSeconds: 1, secure: false })).toBe('jar=v1; Path=/p; Max-Age=1; HttpOnly; SameSite=Lax');
    expect(clearCookie('jar', { path: '/p', secure: true })).toBe('jar=; Path=/p; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
  });
});

describe('readCookie', () => {
  it('finds one cookie by exact name among others', () => {
    expect(readCookie('a=1; jar=sb1.xyz; jar2=no', 'jar')).toBe('sb1.xyz');
    expect(readCookie('xjar=1', 'jar')).toBeNull();
    expect(readCookie(undefined, 'jar')).toBeNull();
    expect(readCookie('jar=', 'jar')).toBeNull();
  });
});

describe('createSealedCookie', () => {
  const box = createSecretBox(SECRET, { info: 'test:cookie' });
  let now = new Date('2026-11-05T10:00:00Z');
  const jar = createSealedCookie({ box, name: 'jar', schema, ttlMs: 600_000, now: () => now });

  it('round-trips a value without showing it in the cookie', () => {
    const sealed = jar.seal({ step: 'personal' });
    expect(sealed).not.toContain('personal');
    expect(jar.open(sealed)).toEqual({ step: 'personal' });
  });

  it('refuses a tampered, foreign, expired or malformed value', () => {
    const sealed = jar.seal({ step: 'x' });
    expect(jar.open(`${sealed.slice(0, -2)}AA`)).toBeNull();
    const other = createSealedCookie({ box, name: 'other-jar', schema, ttlMs: 600_000, now: () => now });
    expect(other.open(sealed)).toBeNull();
    const otherKey = createSealedCookie({ box: createSecretBox(SECRET, { info: 'test:other' }), name: 'jar', schema, ttlMs: 600_000, now: () => now });
    expect(otherKey.open(sealed)).toBeNull();
    expect(jar.open('garbage')).toBeNull();
    expect(jar.open(null)).toBeNull();
    const wrongShape = box.seal(JSON.stringify({ value: { step: 1 }, expiresAt: now.getTime() + 1000 }), 'jar');
    expect(jar.open(wrongShape)).toBeNull();
    expect(jar.open(box.seal('not json', 'jar'))).toBeNull();
    now = new Date(now.getTime() + 600_001);
    expect(jar.open(sealed)).toBeNull();
  });
});
