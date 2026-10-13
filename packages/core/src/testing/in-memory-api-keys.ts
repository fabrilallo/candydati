import { createHash } from 'node:crypto';
import type { ApiKey, Role } from '@tt/domain';
import type { ApiKeyRepository, MemberRoleLookup } from '../api-key-ports.js';

export interface InMemoryApiKeys extends ApiKeyRepository {
  snapshot(): readonly ApiKey[];
  /** Test double of a key row edited behind the use cases (e.g. scopes written straight into the database). */
  overwrite(key: ApiKey): void;
}

export function createInMemoryApiKeys(initial: readonly ApiKey[] = []): InMemoryApiKeys {
  let rows: readonly ApiKey[] = [...initial];
  const replace = (key: ApiKey) => {
    rows = rows.map((row) => (row.organizationId === key.organizationId && row.id === key.id ? key : row));
  };
  return {
    async create(key) {
      rows = [...rows, key];
      return key;
    },
    async save(key) {
      replace(key);
      return key;
    },
    async findById(organizationId, id) {
      return rows.find((row) => row.organizationId === organizationId && row.id === id) ?? null;
    },
    async findByPrefix(prefix) {
      return rows.find((row) => row.prefix === prefix) ?? null;
    },
    async list(organizationId) {
      return rows.filter((row) => row.organizationId === organizationId).toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async touch(organizationId, id, at) {
      rows = rows.map((row) => (row.organizationId === organizationId && row.id === id ? { ...row, lastUsedAt: at } : row));
    },
    snapshot: () => rows,
    overwrite: replace,
  };
}

export interface InMemoryMemberRoles extends MemberRoleLookup {
  set(organizationId: string, userId: string, role: Role | null): void;
}

export function createInMemoryMemberRoles(initial: Readonly<Record<string, Role>> = {}): InMemoryMemberRoles {
  const roles = new Map<string, Role>(Object.entries(initial));
  const key = (organizationId: string, userId: string) => `${organizationId}|${userId}`;
  return {
    async roleOf(organizationId, userId) {
      return roles.get(key(organizationId, userId)) ?? null;
    },
    set(organizationId, userId, role) {
      if (role === null) roles.delete(key(organizationId, userId));
      else roles.set(key(organizationId, userId), role);
    },
  };
}

export const sha256Hex = (secret: string): string => createHash('sha256').update(secret).digest('hex');
