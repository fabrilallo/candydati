import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleVideoRooms } from './drizzle-video-rooms.js';

let handle: DbHandle;
const NOW = new Date('2026-11-16T07:00:00Z');
const ROOM = 'https://meet.google.com/abc-defg-hij';

const insertOrg = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};
const insertUser = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.user).values({ id, name: id, email: `${id}@x.it` });
  return id;
};

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl());
});
afterAll(async () => handle.close());

describe('createDrizzleVideoRooms', () => {
  it('keeps one room per person and organization, replaced on save', async () => {
    const repo = createDrizzleVideoRooms(handle.db);
    const [a, b, anna] = [await insertOrg(), await insertOrg(), await insertUser()];
    await repo.save({ organizationId: a, userId: anna, url: ROOM, createdAt: NOW, updatedAt: NOW });
    await repo.save({ organizationId: a, userId: anna, url: 'https://zoom.us/j/1', createdAt: NOW, updatedAt: new Date('2026-11-17T07:00:00Z') });
    expect(await repo.find(a, anna)).toEqual({ organizationId: a, userId: anna, url: 'https://zoom.us/j/1', createdAt: NOW, updatedAt: new Date('2026-11-17T07:00:00Z') });
    expect(await repo.find(b, anna)).toBeNull();
    expect((await repo.listByUsers(a, [anna, randomUUID()])).map((room) => room.url)).toEqual(['https://zoom.us/j/1']);
    expect(await repo.listByUsers(b, [anna])).toEqual([]);
    expect(await repo.listByUsers(a, [])).toEqual([]);
  });

  it('removes only the person’s room in that organization', async () => {
    const repo = createDrizzleVideoRooms(handle.db);
    const [a, b, anna] = [await insertOrg(), await insertOrg(), await insertUser()];
    await repo.save({ organizationId: a, userId: anna, url: ROOM, createdAt: NOW, updatedAt: NOW });
    await repo.save({ organizationId: b, userId: anna, url: ROOM, createdAt: NOW, updatedAt: NOW });
    expect(await repo.remove(a, anna)).toBe(true);
    expect(await repo.remove(a, anna)).toBe(false);
    expect(await repo.find(b, anna)).not.toBeNull();
  });
});
