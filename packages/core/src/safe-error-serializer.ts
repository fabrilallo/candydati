const PG_CODE = /^[0-9A-Z]{5}$/;
const MAX_DEPTH = 4;

/** The shape pino's `err` serializer slot expects. `stack` is empty for a database error (it repeats the message). */
export interface SerializedError {
  readonly [key: string]: unknown;
  readonly type: string;
  readonly message: string;
  readonly stack: string;
}
type Fields = Record<string, unknown>;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length <= 200 ? value : undefined);

const pgCodeOf = (error: unknown): string | null => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && PG_CODE.test(code) ? code : null;
};

/** A failed Drizzle query (message carries the SQL and the values, plus `query` and `params`) or a raw pg error. */
const isDatabaseError = (error: Error): boolean => {
  const fields = error as Error & { query?: unknown; params?: unknown; severity?: unknown };
  return 'params' in fields || 'query' in fields || (pgCodeOf(error) !== null && 'severity' in fields) || /^Failed query:/.test(error.message);
};

/** Where in the schema it failed, never what was in the row: `detail`, `where` and the bound values hold personal data. */
function databaseFields(error: Error, nested: Error | undefined): SerializedError {
  const origin = (nested !== undefined && isDatabaseError(nested) ? nested : error) as Error & Fields;
  const code = pgCodeOf(origin) ?? pgCodeOf(error);
  return {
    type: error.name,
    stack: '',
    message: code ? `database error ${code}` : 'database error',
    ...(code ? { code } : {}),
    ...(text(origin.constraint) ? { constraint: text(origin.constraint) } : {}),
    ...(text(origin.table) ? { table: text(origin.table) } : {}),
    ...(text(origin.column) ? { column: text(origin.column) } : {}),
    ...(text(origin.schema) ? { schema: text(origin.schema) } : {}),
  };
}

/**
 * The pino `err` serializer of the api and the worker. Drizzle puts the SQL and the bound parameters (names, emails,
 * messages of candidates) into the error message and into `query`/`params`; the pg driver adds the offending row to
 * `detail`. A database error is logged with its SQLSTATE, constraint and table only, and without a stack (the stack
 * repeats the message). Any other error keeps its type, message, stack and cause chain.
 */
export function safeErrorSerializer(error: unknown, depth = 0): SerializedError {
  if (!(error instanceof Error)) return { type: 'unknown', message: String(error), stack: '' };
  const cause = (error as { cause?: unknown }).cause;
  if (isDatabaseError(error) || (cause instanceof Error && isDatabaseError(cause) && /^Failed query:/.test(error.message))) {
    return databaseFields(error, cause instanceof Error ? cause : undefined);
  }
  return {
    type: error.name,
    message: error.message,
    stack: error.stack ?? '',
    ...(cause !== undefined && depth < MAX_DEPTH ? { cause: safeErrorSerializer(cause, depth + 1) } : {}),
  };
}
