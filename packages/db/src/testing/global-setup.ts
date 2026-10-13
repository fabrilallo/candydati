import pg from 'pg';
import { databaseName, maintenanceDatabaseUrl, testDatabaseUrl } from './test-database.js';

/** Drops and recreates the dedicated test database so every run starts from an empty one. */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = databaseName(url);
  const client = new pg.Client({ connectionString: maintenanceDatabaseUrl(url) });
  try {
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    throw new Error(
      `Cannot prepare test database "${name}" (is Postgres up? try \`pnpm infra:up\`): ${(error as Error).message}`,
      { cause: error },
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
