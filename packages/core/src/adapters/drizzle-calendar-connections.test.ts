import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CalendarConnectionRecord } from '../calendar-connection-ports.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleCalendarConnections } from './drizzle-calendar-connections.js';

let handle: DbHandle;
const NOW = new Date('2026-11-16T07:00:00Z');
const LATER = new Date('2026-11-17T07:00:00Z');

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
const connection = (organizationId: string, userId: string, overrides: Partial<CalendarConnectionRecord> = {}): CalendarConnectionRecord => ({
  organizationId,
  userId,
  provider: 'google',
  accountEmail: 'anna@example.com',
  refreshTokenCiphertext: 'sb1.sealed',
  scopes: ['openid', 'https://www.googleapis.com/auth/calendar.freebusy'],
  status: 'active',
  lastError: null,
  timeZone: 'Europe/Rome',
  workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  busy: [],
  fetchedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl());
});
afterAll(async () => handle.close());

describe('createDrizzleCalendarConnections', () => {
  it('keeps one connection per person, organization and provider, replaced on save', async () => {
    const repo = createDrizzleCalendarConnections(handle.db);
    const [a, b, anna] = [await insertOrg(), await insertOrg(), await insertUser()];
    await repo.save(connection(a, anna));
    await repo.save(connection(a, anna, { accountEmail: 'anna.work@example.com', refreshTokenCiphertext: 'sb1.other', createdAt: LATER, updatedAt: LATER }));
    expect(await repo.find(a, anna, 'google')).toEqual(connection(a, anna, { accountEmail: 'anna.work@example.com', refreshTokenCiphertext: 'sb1.other', updatedAt: LATER }));
    expect(await repo.find(b, anna, 'google')).toBeNull();
  });

  it('removes only the person’s connection in that organization', async () => {
    const repo = createDrizzleCalendarConnections(handle.db);
    const [a, b, anna] = [await insertOrg(), await insertOrg(), await insertUser()];
    await repo.save(connection(a, anna));
    await repo.save(connection(b, anna));
    expect(await repo.remove(a, anna, 'google')).toBe(true);
    expect(await repo.remove(a, anna, 'google')).toBe(false);
    expect(await repo.find(b, anna, 'google')).not.toBeNull();
  });

  it('records a read and shares the hours across the person’s connections', async () => {
    const repo = createDrizzleCalendarConnections(handle.db);
    const [a, anna, luca] = [await insertOrg(), await insertUser(), await insertUser()];
    await repo.save(connection(a, anna));
    await repo.save(connection(a, luca));
    const busy = [{ start: new Date('2026-11-16T09:00:00Z'), end: new Date('2026-11-16T10:00:00Z') }];
    await repo.recordRefresh(a, anna, 'google', { busy, fetchedAt: LATER, lastError: 'unreachable', status: 'active' });
    const hours = { days: [2], start: '10:00', end: '12:00' };
    expect(await repo.updatePreferences(a, anna, { timeZone: 'Europe/London', workingHours: hours, updatedAt: LATER })).toBe(true);
    expect(await repo.find(a, anna, 'google')).toMatchObject({ busy, fetchedAt: LATER, lastError: 'unreachable', timeZone: 'Europe/London', workingHours: hours });
    expect((await repo.listByUsers(a, [anna, luca, 'nobody'], 'google')).map((row) => row.userId).sort()).toEqual([anna, luca].sort());
    expect(await repo.listByUsers(a, [], 'google')).toEqual([]);
    expect(await repo.updatePreferences(a, 'nobody', { timeZone: 'Europe/London', workingHours: hours, updatedAt: LATER })).toBe(false);
  });
});

