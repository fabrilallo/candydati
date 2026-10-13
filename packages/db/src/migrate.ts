import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.js';

/** Generated SQL migrations. `../drizzle` resolves to the same folder from both `src/` and `dist/`. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Applies pending migrations in order and records them in drizzle's journal: already-applied ones are skipped,
 * so it is safe on every start. Opens its own short-lived connection.
 */
export const runMigrations = async (databaseUrl: string, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> => {
  const handle = createDb(databaseUrl, 1);
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
};
