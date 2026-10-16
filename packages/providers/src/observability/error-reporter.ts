import { buildErrorEnvelope, parseDsn, type ParsedDsn, type ReportTags, type ErrorReportInput } from '@candydati/domain';

export interface ErrorReporter {
  readonly enabled: boolean;
  /** Fire and forget: never throws and never waits on the collector. */
  capture(error: unknown, tags?: ReportTags): void;
}

export const disabledErrorReporter: ErrorReporter = Object.freeze({ enabled: false, capture: () => undefined });

export interface ErrorReporterOptions {
  /** Empty or invalid: reporting is off (nothing is sent). */
  readonly dsn: string | null;
  readonly service: 'api' | 'worker' | 'web';
  readonly environment?: string | undefined;
  readonly release?: string | undefined;
  readonly describe?: ErrorReportInput['describe'];
  /** Reports per minute at most: a failing loop must not flood the collector. Default 30. */
  readonly maxPerMinute?: number | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly now?: (() => number) | undefined;
  /** Delivery problems, as a safe line (no event content). */
  readonly onProblem?: ((reason: string) => void) | undefined;
}

const SEND_TIMEOUT_MS = 5_000;

/** Errors to a Sentry-compatible collector over plain HTTP. Off unless a valid DSN is given. */
export function createErrorReporter(options: ErrorReporterOptions): ErrorReporter {
  const dsn: ParsedDsn | null = options.dsn ? parseDsn(options.dsn) : null;
  if (options.dsn && !dsn) options.onProblem?.('SENTRY_DSN is not a valid DSN: error reporting is off');
  if (!dsn) return disabledErrorReporter;
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const limit = options.maxPerMinute ?? 30;
  let windowStart = now();
  let sent = 0;
  let dropped = 0;
  return {
    enabled: true,
    capture(error, tags) {
      const at = now();
      if (at - windowStart >= 60_000) {
        if (dropped > 0) options.onProblem?.(`${dropped} error report(s) dropped by the rate limit`);
        windowStart = at;
        sent = 0;
        dropped = 0;
      }
      if (sent >= limit) {
        dropped += 1;
        return;
      }
      sent += 1;
      try {
        const request = buildErrorEnvelope(dsn, { error, tags: { service: options.service, ...tags }, environment: options.environment, release: options.release, describe: options.describe });
        void send(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }).then(
          (response) => {
            if (!response.ok) options.onProblem?.(`error collector answered ${response.status}`);
          },
          (failure: unknown) => options.onProblem?.(`error collector unreachable (${failure instanceof Error ? failure.name : 'error'})`),
        );
      } catch {
        options.onProblem?.('error report could not be built');
      }
    },
  };
}
