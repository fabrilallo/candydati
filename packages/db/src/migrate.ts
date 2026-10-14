import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type pg from 'pg';
import { createDb } from './client.js';

/** Generated SQL migrations. `../drizzle` resolves to the same folder from both `src/` and `dist/`. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Constant key of the session-level advisory lock that serialises migration runs across replicas. */
export const MIGRATION_LOCK_KEY = 7_450_201_139;

const JOURNAL_SCHEMA = 'drizzle';
const JOURNAL_TABLE = '__drizzle_migrations';
const JOURNAL = `"${JOURNAL_SCHEMA}"."${JOURNAL_TABLE}"`;

/** `CREATE INDEX CONCURRENTLY` (and friends) cannot run inside a transaction block. */
const NEEDS_NO_TRANSACTION = /\bCONCURRENTLY\b/i;

interface PendingMigration {
  readonly sql: readonly string[];
  readonly hash: string;
  readonly folderMillis: number;
}

const ensureJournal = async (client: pg.PoolClient): Promise<void> => {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${JOURNAL_SCHEMA}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${JOURNAL} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  );
};

const lastAppliedMillis = async (client: pg.PoolClient): Promise<number> => {
  const { rows } = await client.query<{ created_at: string | null }>(
    `SELECT created_at FROM ${JOURNAL} ORDER BY created_at DESC LIMIT 1`,
  );
  return rows[0]?.created_at ? Number(rows[0].created_at) : -1;
};

const record = (client: pg.PoolClient, migration: PendingMigration): Promise<unknown> =>
  client.query(`INSERT INTO ${JOURNAL} ("hash", "created_at") VALUES ($1, $2)`, [
    migration.hash,
    migration.folderMillis,
  ]);

const applyInTransaction = async (client: pg.PoolClient, migration: PendingMigration): Promise<void> => {
  await client.query('BEGIN');
  try {
    for (const statement of migration.sql) await client.query(statement);
    await record(client, migration);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
};

/** Autocommit: statements must be idempotent (`IF NOT EXISTS`), see docs/MIGRATIONS.md. */
const applyWithoutTransaction = async (client: pg.PoolClient, migration: PendingMigration): Promise<void> => {
  for (const statement of migration.sql) await client.query(statement);
  await record(client, migration);
};

/**
 * Applies pending migrations in journal order, one transaction each (a migration containing `CONCURRENTLY` runs
 * outside a transaction), and records them in drizzle's own journal table, so the result is interchangeable with
 * `drizzle-kit migrate`. A session advisory lock makes concurrent runners (several api replicas) wait for the
 * first one instead of racing. Opens its own short-lived connection.
 */
export const runMigrations = async (databaseUrl: string, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> => {
  const migrations = readMigrationFiles({ migrationsFolder });
  const handle = createDb(databaseUrl, 1);
  const client = await handle.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      await ensureJournal(client);
      const last = await lastAppliedMillis(client);
      for (const migration of migrations) {
        if (migration.folderMillis <= last) continue;
        const run = migration.sql.some((statement) => NEEDS_NO_TRANSACTION.test(statement))
          ? applyWithoutTransaction
          : applyInTransaction;
        await run(client, migration);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
    await handle.close();
  }
};
