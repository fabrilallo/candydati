import { inArray, schema, sql, type Db } from '@tt/db';
import type { ThrottleCounter, ThrottleStore } from './sign-in-throttle.js';

const table = schema.authThrottle;
/** Rows untouched for longer than this are deleted (at most once per PRUNE_EVERY_MS per process). */
const KEEP_MS = 31 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

type Row = { key: string; failures: number; last_at: Date | string; notified_at: Date | string | null };

const toMillis = (value: Date | string): number => (value instanceof Date ? value.getTime() : new Date(value).getTime());
const toCounter = (row: Row): ThrottleCounter => ({
  failures: row.failures,
  lastAt: toMillis(row.last_at),
  notifiedAt: row.notified_at === null ? null : toMillis(row.notified_at),
});

/** +1 failure on `key`, starting again from 1 when its last failure is older than `cutoff`. */
async function upsertFailure(db: Db, key: string, stamp: Date, cutoff: Date): Promise<Row | undefined> {
  const { rows } = await db.execute<Row>(sql`
    insert into auth_throttle (key, failures, first_failure_at, last_at) values (${key}, 1, ${stamp}, ${stamp})
    on conflict (key) do update set
      failures = case when auth_throttle.last_at <= ${cutoff} then 1 else auth_throttle.failures + 1 end,
      first_failure_at = case when auth_throttle.last_at <= ${cutoff} then ${stamp} else auth_throttle.first_failure_at end,
      last_at = ${stamp}
    returning key, failures, last_at, notified_at`);
  return rows[0];
}

/**
 * The sign-in throttle in Postgres (`auth_throttle`): every api instance sees the same counters. Each write is a
 * single upsert, atomic per key, so two instances counting the same failure never lose one.
 */
export function createPgThrottleStore(db: Db, now: () => number = Date.now): ThrottleStore {
  let lastPrune = 0;
  const pruneOccasionally = async (): Promise<void> => {
    const at = now();
    if (at - lastPrune < PRUNE_EVERY_MS) return;
    lastPrune = at;
    await db.execute(sql`delete from auth_throttle where last_at < ${new Date(at - KEEP_MS)}`);
  };

  const read = async (keys: readonly string[]): Promise<ReadonlyMap<string, ThrottleCounter>> => {
    if (keys.length === 0) return new Map();
    const rows = await db
      .select({ key: table.key, failures: table.failures, last_at: table.lastAt, notified_at: table.notifiedAt })
      .from(table)
      .where(inArray(table.key, [...keys]));
    return new Map(rows.map((row) => [row.key, toCounter(row)]));
  };

  return {
    read,
    async addFailure(keys, at, windowMs) {
      const results = new Map<string, ThrottleCounter>();
      for (const key of keys) {
        const row = await upsertFailure(db, key, new Date(at), new Date(at - windowMs));
        if (row) results.set(key, toCounter(row));
      }
      await pruneOccasionally();
      return results;
    },
    async claimNotice(key, at, cooldownMs) {
      const { rows } = await db.execute<{ key: string }>(sql`
        update auth_throttle set notified_at = ${new Date(at)}
        where key = ${key} and (notified_at is null or notified_at <= ${new Date(at - cooldownMs)})
        returning key`);
      return rows.length > 0;
    },
    async remember(key, at) {
      const stamp = new Date(at);
      await db.execute(sql`
        insert into auth_throttle (key, failures, first_failure_at, last_at) values (${key}, 0, ${stamp}, ${stamp})
        on conflict (key) do update set failures = 0, last_at = ${stamp}`);
    },
    async clear(keys) {
      if (keys.length > 0) await db.delete(table).where(inArray(table.key, [...keys]));
    },
  };
}
