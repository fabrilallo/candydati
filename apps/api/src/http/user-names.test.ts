import type { UserDirectory } from '@tt/core';
import { describe, expect, it } from 'vitest';
import { createUserNameLookup } from './user-names.js';

describe('createUserNameLookup', () => {
  it('asks the core directory for the actors of the organization only, once per id, and skips an empty page', async () => {
    const calls: unknown[] = [];
    const users: UserDirectory = {
      namesOf: async () => ({}),
      actorNamesOf: async (organizationId, userIds) => {
        calls.push([organizationId, userIds]);
        return organizationId === 'org_a' ? { u1: 'Ada' } : {};
      },
    };
    const lookup = createUserNameLookup(users);
    expect(await lookup('org_a', ['u1', 'u1', 'u2'])).toEqual(new Map([['u1', 'Ada']]));
    expect(await lookup('org_b', ['u1'])).toEqual(new Map());
    expect(await lookup('org_a', [])).toEqual(new Map());
    expect(calls).toEqual([
      ['org_a', ['u1', 'u2']],
      ['org_b', ['u1']],
    ]);
  });
});
