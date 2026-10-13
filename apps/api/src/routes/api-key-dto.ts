import type { ApiKeyView, Permission } from '@tt/domain';
import type { UserNames } from '../http/audit-dto.js';

export interface ApiKeyDto {
  readonly id: string;
  readonly name: string;
  /** First characters of the secret, to recognise a key. The secret itself is shown once, at creation. */
  readonly prefix: string;
  readonly scopes: readonly Permission[];
  readonly createdBy: string;
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

export const toApiKeyDto = (key: ApiKeyView, names: UserNames): ApiKeyDto => ({
  id: key.id,
  name: key.name,
  prefix: key.prefix,
  scopes: key.scopes,
  createdBy: key.createdBy,
  createdByName: names.get(key.createdBy) ?? null,
  createdAt: key.createdAt.toISOString(),
  lastUsedAt: isoOrNull(key.lastUsedAt),
  expiresAt: isoOrNull(key.expiresAt),
  revokedAt: isoOrNull(key.revokedAt),
});
