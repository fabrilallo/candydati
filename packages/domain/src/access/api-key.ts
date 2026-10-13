import { z } from 'zod';
import { isPermission, type Permission } from './permissions.js';

/** Secret format: `tt_<prefix>_<random>`, base62 parts. The prefix is stored and shown; the rest only hashed. */
export const API_KEY_SECRET_PREFIX = 'tt_';
export const API_KEY_PREFIX_LENGTH = 8;
export const API_KEY_RANDOM_LENGTH = 32;
export const API_KEY_NAME_MAX = 80;
export const API_KEY_SECRET_PATTERN = new RegExp(
  `^${API_KEY_SECRET_PREFIX}([0-9A-Za-z]{${API_KEY_PREFIX_LENGTH}})_[0-9A-Za-z]{${API_KEY_RANDOM_LENGTH}}$`,
);

export const apiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX),
  scopes: z
    .array(z.custom<Permission>(isPermission, 'Unknown permission.'))
    .min(1)
    .transform((scopes) => [...new Set(scopes)]),
  expiresAt: z.coerce.date().optional(),
});
export type ApiKeyInput = z.input<typeof apiKeyInputSchema>;

export interface ApiKey {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  /** First characters of the secret after `tt_`, shown in listings to recognise a key. */
  readonly prefix: string;
  /** sha256 of the full secret, hex. */
  readonly hash: string;
  readonly scopes: readonly Permission[];
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

/** The part of a key that may leave the server: never the hash. */
export type ApiKeyView = Omit<ApiKey, 'hash'>;

export const formatApiKeySecret = (prefix: string, random: string): string => `${API_KEY_SECRET_PREFIX}${prefix}_${random}`;

/** The stored prefix of a well-formed secret, or null: used to look the key up before comparing hashes. */
export function parseApiKeySecret(secret: string): { readonly prefix: string } | null {
  const match = API_KEY_SECRET_PATTERN.exec(secret);
  const prefix = match?.[1];
  return prefix === undefined ? null : { prefix };
}

export const isApiKeySecret = (value: unknown): value is string => typeof value === 'string' && API_KEY_SECRET_PATTERN.test(value);
