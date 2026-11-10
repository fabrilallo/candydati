import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@candydati/db';
import { DEFAULT_WORKING_HOURS } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CalendarFeedRecord } from '../calendar-ports.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleCalendarFeeds } from './drizzle-calendar-feeds.js';

let handle: DbHandle;
const NOW = new Date('2026-11-16T07:00:00Z');

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
const record = (organizationId: string, userId: string): CalendarFeedRecord => ({
  organizationId,
  userId,
  urlCiphertext: 'sb1.sealed',
  host: 'calendar.google.com',
  timeZone: 'Europe/Rome',
  workingHours: DEFAULT_WORKING_HOURS,
  busy: [{ start: new Date('2026-11-16T09:00:00Z'), end: new Date('2026-11-16T10:00:00Z') }],
  fetchedAt: NOW,
  lastError: null,
  createdAt: NOW,
  updatedAt: NOW,
});

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl());
});
afterAll(async () => handle.close());

describe('createDrizzleCalendarFeeds', () => {
  it('stores one link per person and organization, busy times as instants', async () => {
    const repo = createDrizzleCalendarFeeds(handle.db);
    const [a, b, anna] = [await insertOrg(), await insertOrg(), await insertUser()];
    await repo.save(record(a, anna));
    expect(await repo.find(a, anna)).toEqual(record(a, anna));
    expect(await repo.find(b, anna)).toBeNull();
    await repo.save({ ...record(a, anna), host: 'outlook.office365.com', urlCiphertext: 'sb1.other' });
    expect(await repo.find(a, anna)).toMatchObject({ host: 'outlook.office365.com', urlCiphertext: 'sb1.other' });
    expect(await repo.listByUsers(a, [anna, 'nobody'])).toHaveLength(1);
    expect(await repo.listByUsers(a, [])).toEqual([]);
  });

  it('records a refresh, changes preferences and removes', async () => {
    const repo = createDrizzleCalendarFeeds(handle.db);
    const [a, anna] = [await insertOrg(), await insertUser()];
    await repo.save(record(a, anna));
    const later = new Date('2026-11-16T08:00:00Z');
    await repo.recordRefresh(a, anna, { busy: [], fetchedAt: later, lastError: 'unreachable' });
    expect(await repo.find(a, anna)).toMatchObject({ busy: [], fetchedAt: later, lastError: 'unreachable' });
    expect(await repo.updatePreferences(a, anna, { timeZone: 'Europe/London', workingHours: { days: [1], start: '10:00', end: '12:00' }, updatedAt: later })).toBe(true);
    expect(await repo.updatePreferences(a, 'nobody', { timeZone: 'Europe/London', workingHours: DEFAULT_WORKING_HOURS, updatedAt: later })).toBe(false);
    expect(await repo.remove(a, anna)).toBe(true);
    expect(await repo.remove(a, anna)).toBe(false);
  });

  it('goes with the user', async () => {
    const repo = createDrizzleCalendarFeeds(handle.db);
    const [a, anna] = [await insertOrg(), await insertUser()];
    await repo.save(record(a, anna));
    await handle.db.delete(schema.user).where(eq(schema.user.id, anna));
    expect(await repo.find(a, anna)).toBeNull();
  });
});
