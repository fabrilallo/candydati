import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export const SECRET_BOX_VERSION = 'sb1';
export const DEFAULT_SECRET_BOX_INFO = 'candydati:migration-credentials';
const SALT = 'candydati-secret-box';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MIN_SECRET_CHARS = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type SecretBoxErrorCode = 'malformed' | 'unsupported_version' | 'unauthentic' | 'weak_secret';

/** Why an envelope could not be sealed or opened. The message never carries the plaintext, the key or the envelope. */
export class SecretBoxError extends Error {
  constructor(readonly code: SecretBoxErrorCode) {
    super(`secret box: ${code}`);
    this.name = 'SecretBoxError';
  }
}

export interface SecretBox {
  /** Encrypts `plaintext`, bound to `context` (e.g. the batch id): it opens only with the same context. */
  seal(plaintext: string, context: string): string;
  open(envelope: string, context: string): string;
}

export interface SecretBoxOptions {
  /** HKDF `info`: one derived key per purpose. */
  readonly info?: string;
}

const aadOf = (info: string, context: string): Buffer => Buffer.from(`${SECRET_BOX_VERSION}|${info}|${context}`, 'utf8');

/** Constant-time check of the version prefix (`sb1.`). */
function checkVersion(envelope: string): string {
  const dot = envelope.indexOf('.');
  if (dot < 0) throw new SecretBoxError('malformed');
  const given = Buffer.from(envelope.slice(0, dot), 'utf8');
  const expected = Buffer.from(SECRET_BOX_VERSION, 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new SecretBoxError('unsupported_version');
  return envelope.slice(dot + 1);
}

function decode(body: string): { nonce: Buffer; ciphertext: Buffer; tag: Buffer } {
  if (!BASE64URL.test(body)) throw new SecretBoxError('malformed');
  const raw = Buffer.from(body, 'base64url');
  if (raw.length < NONCE_BYTES + TAG_BYTES) throw new SecretBoxError('malformed');
  return { nonce: raw.subarray(0, NONCE_BYTES), ciphertext: raw.subarray(NONCE_BYTES, raw.length - TAG_BYTES), tag: raw.subarray(raw.length - TAG_BYTES) };
}

/**
 * AES-256-GCM with a key derived by HKDF-SHA256 from an instance secret (`BETTER_AUTH_SECRET`), one key per `info`.
 * Envelope: `sb1.` + base64url(nonce(12) ‖ ciphertext ‖ tag(16)); AAD = `sb1|<info>|<context>`. A random nonce per seal.
 * Used for connector credentials while a migration fetch runs (ADR 0009, decision 5).
 */
export function createSecretBox(secret: string, { info = DEFAULT_SECRET_BOX_INFO }: SecretBoxOptions = {}): SecretBox {
  if (secret.length < MIN_SECRET_CHARS) throw new SecretBoxError('weak_secret');
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from(SALT, 'utf8'), Buffer.from(info, 'utf8'), KEY_BYTES));
  return {
    seal(plaintext, context) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
      cipher.setAAD(aadOf(info, context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return `${SECRET_BOX_VERSION}.${Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]).toString('base64url')}`;
    },
    open(envelope, context) {
      const { nonce, ciphertext, tag } = decode(checkVersion(envelope));
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
        decipher.setAAD(aadOf(info, context));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      } catch {
        throw new SecretBoxError('unauthentic');
      }
    },
  };
}
