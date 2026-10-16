/** Local dev default only (docker-compose.yml); real environments set DATABASE_URL. */
export const DEV_DATABASE_URL = 'postgres://candydati:candydati@localhost:5434/candydati';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

const isPostgresUrl = (value: string): boolean => {
  try {
    return POSTGRES_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Database `pnpm db:migrate` targets. Never echoes the value: it carries the password. */
export const migrationDatabaseUrl = (env: Readonly<Record<string, string | undefined>>): string => {
  const url = env['DATABASE_URL']?.trim();
  if (!url) return DEV_DATABASE_URL;
  if (!isPostgresUrl(url)) throw new Error('DATABASE_URL must be a postgres:// or postgresql:// url.');
  return url;
};
