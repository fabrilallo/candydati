export const DEFAULT_TEST_DATABASE_URL = 'postgres://candydati:candydati@localhost:5434/candydati_test';

/** Connection string of the dedicated test database (never the dev one). */
export const testDatabaseUrl = (): string => process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

/** Same server, `postgres` maintenance database: used to drop and recreate the test database. */
export const maintenanceDatabaseUrl = (url: string = testDatabaseUrl()): string => {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
};

/** Database name from a connection string, validated so it can be safely quoted as an identifier. */
export const databaseName = (url: string = testDatabaseUrl()): string => {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Unsafe or missing test database name: "${name}"`);
  if (!name.endsWith('_test')) throw new Error(`Refusing to drop "${name}": test database name must end with _test`);
  return name;
};
