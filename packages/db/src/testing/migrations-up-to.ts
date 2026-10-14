import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { MIGRATIONS_FOLDER, runMigrations } from '../migrate.js';
import { maintenanceDatabaseUrl, testDatabaseUrl } from './test-database.js';

interface JournalEntry {
  readonly tag: string;
}

/** The real migrations up to and including `lastTag`: the database as an instance of the previous release has it. */
export const migrationsUpTo = (lastTag: string): string => {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  const entries = journal.entries.slice(0, last + 1);
  const folder = mkdtempSync(join(tmpdir(), 'tt-migrations-upto-'));
  mkdirSync(join(folder, 'meta'));
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) copyFileSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  return folder;
};

export interface ScratchDatabase {
  readonly url: string;
  readonly client: pg.Client;
  drop(): Promise<void>;
}

/** A fresh database `name` migrated up to `lastTag`, to seed with the data of an older release before upgrading it. */
export async function scratchDatabaseAt(name: string, lastTag: string): Promise<ScratchDatabase> {
  const admin = new pg.Client({ connectionString: maintenanceDatabaseUrl(testDatabaseUrl()) });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  const parsed = new URL(testDatabaseUrl());
  parsed.pathname = `/${name}`;
  const url = parsed.toString();
  await runMigrations(url, migrationsUpTo(lastTag));
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    url,
    client,
    drop: async () => {
      await client.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}
