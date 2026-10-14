const PG_CODE = /^[0-9A-Z]{5}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

const pgCode = (error: unknown): string | null => {
  const own = (error as { code?: unknown } | null)?.code;
  if (typeof own === 'string' && PG_CODE.test(own)) return own;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === 'string' && PG_CODE.test(cause) ? cause : null;
};

/**
 * A short code for an error that is safe to store and log: the Postgres SQLSTATE (`pg_23505`) when there is one, else
 * the error's class name (`ConflictError`). Never the message: messages and query parameters can carry personal data.
 */
export function safeErrorCode(error: unknown): string {
  const code = pgCode(error);
  if (code) return `pg_${code}`;
  const name = error instanceof Error ? error.name : null;
  return name && NAME.test(name) ? name : 'unknown';
}
