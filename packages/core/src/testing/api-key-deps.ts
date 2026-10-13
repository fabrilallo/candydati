import type { ApiKeyDeps } from '../api-key-ports.js';
import { ORG_A, ORG_B } from './candidate-seed.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import {
  createInMemoryApiKeys,
  createInMemoryMemberRoles,
  sha256Hex,
  type InMemoryApiKeys,
  type InMemoryMemberRoles,
} from './in-memory-api-keys.js';

export type TestApiKeyDeps = ApiKeyDeps & {
  readonly auditLog: InMemoryAuditLog;
  readonly apiKeys: InMemoryApiKeys;
  readonly memberRoles: InMemoryMemberRoles;
  /** Moves the fixed clock. */
  readonly advance: (ms: number) => void;
};

export const API_KEY_TEST_NOW = new Date('2026-06-01T10:00:00.000Z');

/**
 * API key ports in memory with a movable clock and deterministic secrets (`tt_` + 8 + 32 base62 characters). Members:
 * `user_test` owner and `user_rec` recruiter in `org_a`; `user_b` owner in `org_b`.
 */
export function createTestApiKeyDeps(overrides: Partial<TestApiKeyDeps> = {}): TestApiKeyDeps {
  let counter = 0;
  let now = API_KEY_TEST_NOW.getTime();
  return {
    auditLog: createInMemoryAuditLog(),
    apiKeys: createInMemoryApiKeys(),
    memberRoles: createInMemoryMemberRoles({
      [`${ORG_A}|user_test`]: 'owner',
      [`${ORG_A}|user_rec`]: 'recruiter',
      [`${ORG_B}|user_b`]: 'owner',
    }),
    newSecret: () => {
      counter += 1;
      const n = String(counter).padStart(8, '0');
      return `tt_${n}_${'k'.repeat(24)}${n}`;
    },
    hash: sha256Hex,
    newId: () => `key_${String(counter)}`,
    now: () => new Date(now),
    advance: (ms) => {
      now += ms;
    },
    ...overrides,
  };
}
