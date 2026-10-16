import { runMigrations } from './migrate.js';
import { migrationDatabaseUrl } from './migrate-target.js';

/** `pnpm db:migrate`: the same runner the api uses on start (advisory lock, one transaction each, CONCURRENTLY). */
try {
  await runMigrations(migrationDatabaseUrl(process.env));
  process.stdout.write('Migrations applied.\n');
} catch (error) {
  process.stderr.write(`Migrations failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
