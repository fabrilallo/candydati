import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyHmacSignature, verifyResendSignature } from './signature.js';

const secretBytes = Buffer.from('0123456789abcdef0123456789abcdef');
const secret = `whsec_${secretBytes.toString('base64')}`;
const now = new Date('2026-03-03T10:00:00Z');
const ts = String(Math.floor(now.getTime() / 1000));
const body = '{"type":"email.received"}';

function sign(id: string, timestamp: string, payload: string): string {
  return createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${payload}`).digest('base64');
}
function headers(signature: string, extra: Record<string, string> = {}): Record<string, string> {
  return { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': signature, ...extra };
}

describe('verifyResendSignature', () => {
  it('accepts a valid signature (string and bytes bodies)', () => {
    const h = headers(`v1,${sign('msg_1', ts, body)}`);
    expect(verifyResendSignature(body, h, secret, now)).toBe(true);
    expect(verifyResendSignature(Buffer.from(body), h, secret, now)).toBe(true);
  });
  it('accepts when one of several signatures matches and header names differ in case', () => {
    const h = { 'Svix-Id': 'msg_1', 'Svix-Timestamp': ts, 'Svix-Signature': `v1,AAAA v1,${sign('msg_1', ts, body)}` };
    expect(verifyResendSignature(body, h, secret, now)).toBe(true);
  });
  it('rejects a tampered body, wrong secret, wrong version and missing headers', () => {
    const good = `v1,${sign('msg_1', ts, body)}`;
    expect(verifyResendSignature(`${body} `, headers(good), secret, now)).toBe(false);
    expect(verifyResendSignature(body, headers(good), `whsec_${Buffer.from('other').toString('base64')}`, now)).toBe(false);
    expect(verifyResendSignature(body, headers(good.replace('v1', 'v2')), secret, now)).toBe(false);
    expect(verifyResendSignature(body, {}, secret, now)).toBe(false);
    expect(verifyResendSignature(body, headers(good, { 'svix-timestamp': 'abc' }), secret, now)).toBe(false);
  });
  it('enforces the 5 minute tolerance in both directions', () => {
    const old = String(Number(ts) - 301);
    const future = String(Number(ts) + 301);
    for (const stamp of [old, future]) {
      expect(verifyResendSignature(body, headers(`v1,${sign('msg_1', stamp, body)}`, { 'svix-timestamp': stamp }), secret, now)).toBe(false);
    }
    const edge = String(Number(ts) - 299);
    expect(verifyResendSignature(body, headers(`v1,${sign('msg_1', edge, body)}`, { 'svix-timestamp': edge }), secret, now)).toBe(true);
  });
  it('accepts array header values', () => {
    const h = { 'svix-id': ['msg_1'], 'svix-timestamp': [ts], 'svix-signature': [`v1,${sign('msg_1', ts, body)}`] };
    expect(verifyResendSignature(body, h, secret, now)).toBe(true);
  });
});

describe('verifyHmacSignature', () => {
  const key = 'x'.repeat(32);
  const hex = createHmac('sha256', key).update(body).digest('hex');
  it('accepts a valid signature', () => {
    expect(verifyHmacSignature(body, `sha256=${hex}`, key)).toBe(true);
    expect(verifyHmacSignature(Buffer.from(body), `sha256=${hex.toUpperCase()}`, key)).toBe(true);
  });
  it('rejects bad, malformed or missing signatures', () => {
    expect(verifyHmacSignature(`${body}x`, `sha256=${hex}`, key)).toBe(false);
    expect(verifyHmacSignature(body, `sha256=${hex}`, 'y'.repeat(32))).toBe(false);
    expect(verifyHmacSignature(body, hex, key)).toBe(false);
    expect(verifyHmacSignature(body, 'sha256=abcd', key)).toBe(false);
    expect(verifyHmacSignature(body, undefined, key)).toBe(false);
  });
});
