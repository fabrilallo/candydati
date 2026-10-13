import { createDb, runMigrations } from '@tt/db';

export const API_TEST_DATABASE_URL = 'postgres://tt:tt@localhost:5434/team_tracker_api_test';

export const apiTestDatabaseUrl = (): string => process.env.API_TEST_DATABASE_URL ?? API_TEST_DATABASE_URL;

const databaseName = (url: string): string => {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!/^[a-z0-9_]+$/i.test(name) || !name.endsWith('_test')) {
    throw new Error(`Refusing to touch "${name}": test database name must be alphanumeric and end with _test`);
  }
  return name;
};

/** Drops, recreates and migrates the dedicated database so every run starts empty. */
export async function prepareTestDatabase(url: string = apiTestDatabaseUrl()): Promise<void> {
  const name = databaseName(url);
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = createDb(maintenance.toString(), 1);
  try {
    await admin.pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.pool.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    throw new Error(`Cannot prepare test database "${name}" (is Postgres up? try \`pnpm infra:up\`): ${(error as Error).message}`, { cause: error });
  } finally {
    await admin.close();
  }
  await runMigrations(url);
}
