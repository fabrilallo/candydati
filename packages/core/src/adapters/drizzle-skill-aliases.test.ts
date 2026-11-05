import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import type { SkillAliasRecord } from '../skill-alias-ports.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleSkillAliases } from './drizzle-skill-aliases.js';

let handle: DbHandle;
const NOW = new Date('2026-06-01T10:00:00Z');

const insertOrg = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};

const record = (organizationId: string, alias: string, aliasKey: string, at = NOW): SkillAliasRecord => ({ id: randomUUID(), organizationId, skill: 'Go', alias, aliasKey, createdBy: 'user_1', createdAt: at });

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl());
});
afterAll(async () => handle.close());

describe('createDrizzleSkillAliases', () => {
  it('keeps the aliases and the switched-off built-in aliases of each organization apart', async () => {
    const repo = createDrizzleSkillAliases(handle.db);
    const [a, b] = [await insertOrg(), await insertOrg()];
    const mine = await repo.add(record(a, 'Gopher', 'gopher'));
    await repo.add(record(a, 'Go Developer', 'godeveloper', new Date(NOW.getTime() + 1000)));
    await repo.add(record(b, 'Gopher', 'gopher'));
    expect(await repo.disable(a, 'golang', 'user_1', NOW)).toBe(true);
    expect(await repo.disable(a, 'golang', 'user_1', NOW)).toBe(false);
    expect(await repo.load(a)).toMatchObject({ aliases: [{ alias: 'Gopher' }, { alias: 'Go Developer' }], disabled: ['golang'] });
    expect(await repo.load(b)).toMatchObject({ aliases: [{ alias: 'Gopher' }], disabled: [] });
    expect(await repo.remove(b, mine.id)).toBeNull();
    expect(await repo.remove(a, mine.id)).toMatchObject({ alias: 'Gopher' });
    expect((await repo.load(a)).aliases).toHaveLength(1);
    expect(await repo.enable(b, 'golang')).toBe(false);
    expect(await repo.enable(a, 'golang')).toBe(true);
    expect((await repo.load(a)).disabled).toEqual([]);
  });

  it('refuses an alias twice in one organization, however it was written', async () => {
    const repo = createDrizzleSkillAliases(handle.db);
    const org = await insertOrg();
    await repo.add(record(org, 'Gopher', 'gopher'));
    await expect(repo.add(record(org, 'GOPHER!', 'gopher'))).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses an empty or overlong text at the database', async () => {
    const repo = createDrizzleSkillAliases(handle.db);
    const org = await insertOrg();
    await expect(repo.add(record(org, '', ''))).rejects.toThrow();
    await expect(repo.add(record(org, 'x'.repeat(61), 'x'.repeat(61)))).rejects.toThrow();
  });
});
