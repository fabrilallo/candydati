import pg from 'pg';

/** A query issued on a connection that was still busy with another one. */
export interface QueryOverlap {
  /** First characters of the statement that arrived too early. */
  readonly sql: string;
  /** Where it was issued from (the application frames of the stack). */
  readonly stack: string;
}

export interface QueryOverlapGuard {
  /** Overlaps seen since the last `reset`. */
  overlaps(): readonly QueryOverlap[];
  reset(): void;
  uninstall(): void;
}

type Query = (this: PatchedClient, ...args: unknown[]) => unknown;
interface PatchedClient {
  _activeQuery?: unknown;
  _queryQueue?: readonly unknown[];
}

const statementOf = (first: unknown): string => {
  const text = typeof first === 'string' ? first : (first as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').slice(0, 80) : '<submittable>';
};

const frames = (): string =>
  (new Error().stack ?? '')
    .split('\n')
    .slice(2)
    .filter((line) => line.includes('/packages/') || line.includes('/apps/'))
    .filter((line) => !line.includes('node_modules') && !line.includes('query-overlap-guard'))
    .slice(0, 6)
    .join('\n');

/**
 * Test-only. A transaction owns ONE connection, and a connection runs one query at a time: two `await`s started together
 * (`Promise.all`) on it make pg queue the second and warn that this will break in pg@9. This patches `Client.query` to
 * record any query issued while the client is busy, so a test can fail instead of printing a warning nobody reads.
 */
export function installQueryOverlapGuard(): QueryOverlapGuard {
  const proto = pg.Client.prototype as unknown as { query: Query };
  const original = proto.query;
  let found: QueryOverlap[] = [];
  proto.query = function guarded(this: PatchedClient, ...args: unknown[]): unknown {
    if (this._activeQuery || (this._queryQueue?.length ?? 0) > 0) found = [...found, { sql: statementOf(args[0]), stack: frames() }];
    return original.apply(this, args);
  };
  return {
    overlaps: () => found,
    reset: () => {
      found = [];
    },
    uninstall: () => {
      proto.query = original;
    },
  };
}
