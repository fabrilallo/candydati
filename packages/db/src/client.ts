import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  readonly db: Db;
  readonly pool: pg.Pool;
  /** Ends the connection pool. Call once on shutdown. */
  readonly close: () => Promise<void>;
}

const DEFAULT_MAX_CONNECTIONS = 10;

export type IdleErrorHandler = (error: Error) => void;

/** Used when the caller passes no logger: this package has none of its own. */
const writeToStderr: IdleErrorHandler = (error) => {
  process.stderr.write(`[db] idle client error: ${error.message}\n`);
};

export const createDb = (
  databaseUrl: string,
  maxConnections = DEFAULT_MAX_CONNECTIONS,
  onIdleError: IdleErrorHandler = writeToStderr,
): DbHandle => {
  if (!databaseUrl) throw new Error('DATABASE_URL is required to create a database connection');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: maxConnections });
  // An idle client error must not crash the process; queries surface their own errors.
  pool.on('error', onIdleError);
  const db = drizzle(pool, { schema });
  return Object.freeze({ db, pool, close: () => pool.end() });
};
