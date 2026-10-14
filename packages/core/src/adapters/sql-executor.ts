import { sql, type SQL } from '@tt/db';
import type { SqlExecutor } from '../intake-ports.js';
import type { DbExecutor } from './db-executor.js';

/** `select $1 + $2` with its values as a Drizzle `SQL`: each `$n` becomes a bound parameter, never inlined text. */
function fromPositional(text: string, values: readonly unknown[]): SQL {
  const parts = text.split(/\$(\d+)/);
  const chunks = parts.map((part, index) => (index % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`));
  return sql.join(chunks, sql.raw(''));
}

/**
 * The executor a library that brings its own SQL (pg-boss) runs on: on a transaction, its statements are part of it.
 * Dollar-quoted strings (`$$`) are left alone; only `$` followed by digits is a placeholder.
 */
export const toSqlExecutor = (db: DbExecutor): SqlExecutor => ({
  async executeSql(text, values = []) {
    const result = await db.execute(fromPositional(text, values));
    return { rows: result.rows as unknown[] };
  },
});
