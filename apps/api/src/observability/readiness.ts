export type CheckName = 'database' | 'storage' | 'queue';

export interface ReadinessChecks {
  readonly database: () => Promise<void>;
  readonly storage: () => Promise<void>;
  /** Absent where there is no queue to look at (tests). */
  readonly queue?: (() => Promise<void>) | undefined;
}

export interface ReadinessReport {
  readonly ready: boolean;
  readonly checks: Readonly<Partial<Record<CheckName, 'ok' | 'fail'>>>;
  /** Names and reasons for the log, never for the response. */
  readonly failures: ReadonlyArray<{ readonly check: CheckName; readonly error: unknown }>;
}

const CHECK_TIMEOUT_MS = 3_000;

const withTimeout = (work: Promise<void>, ms: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    work.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/** Runs the dependency checks in parallel, each with a timeout, and reports each one as ok or fail. */
export async function runReadiness(checks: ReadinessChecks, timeoutMs = CHECK_TIMEOUT_MS): Promise<ReadinessReport> {
  const entries = (Object.entries(checks) as Array<[CheckName, (() => Promise<void>) | undefined]>).filter(
    (entry): entry is [CheckName, () => Promise<void>] => entry[1] !== undefined,
  );
  const results = await Promise.all(
    entries.map(async ([check, run]) => {
      try {
        await withTimeout(run(), timeoutMs);
        return { check, error: null as unknown };
      } catch (error) {
        return { check, error };
      }
    }),
  );
  const failures = results.filter((result) => result.error !== null).map(({ check, error }) => ({ check, error }));
  return {
    ready: failures.length === 0,
    checks: Object.fromEntries(results.map(({ check, error }) => [check, error === null ? 'ok' : 'fail'])),
    failures,
  };
}
