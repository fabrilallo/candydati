import type { SecretBox } from '@candydati/providers';
import { z } from 'zod';

export interface CookieAttributes {
  readonly path: string;
  readonly maxAgeSeconds: number;
  /** On an https site: the browser sends the cookie back over https only. */
  readonly secure: boolean;
}

/** HttpOnly (no script reads it) and SameSite=Lax (sent on a top-level navigation back from another site, never on its subrequests). */
export const serializeCookie = (name: string, value: string, { path, maxAgeSeconds, secure }: CookieAttributes): string =>
  `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export const clearCookie = (name: string, attributes: Omit<CookieAttributes, 'maxAgeSeconds'>): string =>
  serializeCookie(name, '', { ...attributes, maxAgeSeconds: 0 });

/** The value of one cookie of a `Cookie` header, or null. Empty values count as absent. */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}

export interface SealedCookie<T> {
  /** Encrypted and authenticated, bound to the cookie name, valid for the cookie's lifetime. */
  seal(value: T): string;
  /** The value, or null when absent, tampered with, sealed for another cookie, expired or not of the expected shape. */
  open(raw: string | null): T | null;
}

export interface SealedCookieOptions<T> {
  readonly box: SecretBox;
  readonly name: string;
  readonly schema: z.ZodType<T>;
  readonly ttlMs: number;
  readonly now?: (() => Date) | undefined;
}

const envelopeSchema = z.object({ value: z.unknown(), expiresAt: z.number() });

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

/**
 * A cookie whose content the browser keeps but cannot read or change: AES-256-GCM with a key derived (HKDF) from the
 * server secret for one purpose (`SecretBox`), the cookie name as associated data, and an expiry inside the ciphertext
 * so an old copy stops working even if the browser kept it.
 */
export function createSealedCookie<T>({ box, name, schema, ttlMs, now = () => new Date() }: SealedCookieOptions<T>): SealedCookie<T> {
  return {
    seal: (value) => box.seal(JSON.stringify({ value, expiresAt: now().getTime() + ttlMs }), name),
    open(raw) {
      if (raw === null) return null;
      let plaintext: string;
      try {
        plaintext = box.open(raw, name);
      } catch {
        return null;
      }
      const envelope = envelopeSchema.safeParse(parseJson(plaintext));
      if (!envelope.success || envelope.data.expiresAt <= now().getTime()) return null;
      const value = schema.safeParse(envelope.data.value);
      return value.success ? value.data : null;
    },
  };
}
