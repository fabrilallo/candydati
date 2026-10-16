import { describe, expect, it } from 'vitest';
import { createSecretBox, SecretBoxError, SECRET_BOX_VERSION } from './secret-box.js';

const SECRET = 'a'.repeat(16) + 'B'.repeat(16) + 'xyz';
const OTHER = 'z'.repeat(40);

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof SecretBoxError ? error.code : 'other';
  }
};

const flip = (envelope: string, index: number): string => {
  const raw = Buffer.from(envelope.slice(SECRET_BOX_VERSION.length + 1), 'base64url');
  const copy = Buffer.from(raw);
  copy[index] = (copy[index] ?? 0) ^ 0x01;
  return `${SECRET_BOX_VERSION}.${copy.toString('base64url')}`;
};

describe('createSecretBox', () => {
  const box = createSecretBox(SECRET);

  it('round-trips text, including unicode and the empty string', () => {
    for (const text of ['{"apiKey":"tt-123"}', 'èàù 日本 🔑', '']) {
      expect(box.open(box.seal(text, 'batch_1'), 'batch_1')).toBe(text);
    }
  });

  it('writes a versioned envelope and a fresh nonce every time', () => {
    const a = box.seal('same', 'b');
    const b = box.seal('same', 'b');
    expect(a.startsWith('sb1.')).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain('same');
  });

  it('detects tampering with the nonce, the ciphertext and the tag', () => {
    const envelope = box.seal('secret value', 'b');
    const length = Buffer.from(envelope.slice(4), 'base64url').length;
    for (const index of [0, 11, 12, length - 17, length - 1]) {
      expect(codeOf(() => box.open(flip(envelope, index), 'b')), String(index)).toBe('unauthentic');
    }
  });

  it('refuses another key and another context', () => {
    const envelope = box.seal('secret value', 'batch_1');
    expect(codeOf(() => createSecretBox(OTHER).open(envelope, 'batch_1'))).toBe('unauthentic');
    expect(codeOf(() => box.open(envelope, 'batch_2'))).toBe('unauthentic');
    expect(codeOf(() => createSecretBox(SECRET, { info: 'other:purpose' }).open(envelope, 'batch_1'))).toBe('unauthentic');
  });

  it('refuses an unknown version', () => {
    const envelope = box.seal('x', 'b');
    expect(codeOf(() => box.open(`sb2.${envelope.slice(4)}`, 'b'))).toBe('unsupported_version');
    expect(codeOf(() => box.open(`xx1${envelope.slice(3)}`, 'b'))).toBe('unsupported_version');
  });

  it('refuses malformed envelopes', () => {
    for (const bad of ['', 'sb1', 'sb1.', 'sb1.!!!', `sb1.${Buffer.alloc(20).toString('base64url')}`, 'sb1.abc def', 'garbage']) {
      expect(codeOf(() => box.open(bad, 'b')), bad).toMatch(/malformed|unsupported_version/);
    }
    expect(codeOf(() => box.open('sb1.!!!', 'b'))).toBe('malformed');
  });

  it('refuses a weak secret, and never puts secrets in messages', () => {
    expect(codeOf(() => createSecretBox('short'))).toBe('weak_secret');
    try {
      box.open(box.seal('top-secret-plaintext', 'b'), 'c');
    } catch (error) {
      expect((error as Error).message).not.toContain('top-secret');
      expect((error as Error).message).not.toContain(SECRET);
    }
  });
});
