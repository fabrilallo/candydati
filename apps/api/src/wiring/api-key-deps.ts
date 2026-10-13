import { createHash, randomInt } from 'node:crypto';
import { createDrizzleApiKeys, createDrizzleMemberRoles, type ApiKeyDeps, type AuditLogRepository } from '@tt/core';
import { API_KEY_PREFIX_LENGTH, API_KEY_RANDOM_LENGTH, formatApiKeySecret } from '@tt/domain';
import type { Db } from '@tt/db';
import { randomUUID } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** `randomInt` is unbiased, so every character is uniform over the 62 symbols. */
const randomBase62 = (length: number): string => Array.from({ length }, () => BASE62[randomInt(BASE62.length)]).join('');

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** A new secret `tt_<8 base62>_<32 base62>` from the operating system CSPRNG. */
export const newApiKeySecret = (): string => formatApiKeySecret(randomBase62(API_KEY_PREFIX_LENGTH), randomBase62(API_KEY_RANDOM_LENGTH));

export function createApiKeyDeps(db: Db, auditLog: AuditLogRepository): ApiKeyDeps {
  return {
    auditLog,
    apiKeys: createDrizzleApiKeys(db),
    memberRoles: createDrizzleMemberRoles(db),
    newSecret: newApiKeySecret,
    hash: sha256Hex,
    newId: randomUUID,
    now: () => new Date(),
  };
}
