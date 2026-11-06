import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';

/**
 * Opaque references the model passes back without reading them: what a tool found about a person (full name, profile
 * link) stays sealed with AES-256-GCM under a key derived from the instance secret, bound to the organization (as
 * associated data) and to an expiry. The model sees only the first name and the facts it needs.
 */
export interface Sealer {
  seal(organizationId: string, value: unknown): string;
  /** Null for a reference that is forged, of another organization, or expired. */
  unseal<S extends z.ZodType>(organizationId: string, token: string, schema: S): z.output<S> | null;
}

const IV = 12;
const TAG = 16;
export const SEALED_REF_TTL_MS = 2 * 3600 * 1000;

export function createSealer(secret: string, now: () => number = Date.now): Sealer {
  const key = createHash('sha256').update(`candydati-sealed-ref\u0000${secret}`).digest();
  return {
    seal(organizationId, value) {
      const iv = randomBytes(IV);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(organizationId));
      const body = Buffer.concat([cipher.update(JSON.stringify({ exp: now() + SEALED_REF_TTL_MS, value }), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
    },
    unseal(organizationId, token, schema) {
      try {
        const raw = Buffer.from(token, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV));
        decipher.setAAD(Buffer.from(organizationId));
        decipher.setAuthTag(raw.subarray(IV, IV + TAG));
        const plain = JSON.parse(Buffer.concat([decipher.update(raw.subarray(IV + TAG)), decipher.final()]).toString('utf8')) as { exp?: unknown; value?: unknown };
        if (typeof plain.exp !== 'number' || plain.exp < now()) return null;
        const parsed = schema.safeParse(plain.value);
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}
