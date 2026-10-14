import { buildErrorEnvelope, parseDsn, type ReportTags } from '@tt/domain'

export interface WebErrorReporter {
  readonly enabled: boolean
  /** Fire and forget: never throws, never waits on the collector. */
  capture(error: unknown, tags?: ReportTags): void
}

export interface WebErrorReporterOptions {
  readonly dsn: string
  readonly environment?: string
  readonly maxPerMinute?: number
  readonly fetchImpl?: typeof fetch
  readonly now?: () => number
  readonly onProblem?: (reason: string) => void
}

const OFF: WebErrorReporter = Object.freeze({ enabled: false, capture: () => undefined })
const SEND_TIMEOUT_MS = 5_000

/**
 * Server errors of the web app to a Sentry-compatible collector. Off unless a valid DSN is given. The report is built by
 * `@tt/domain` (the same builder as the api and the worker): error type, scrubbed message, code locations and a few tags.
 * Never a request body, header, cookie, URL or user.
 */
export const createWebErrorReporter = (options: WebErrorReporterOptions): WebErrorReporter => {
  const dsn = options.dsn.trim() === '' ? null : parseDsn(options.dsn)
  if (options.dsn.trim() !== '' && !dsn) options.onProblem?.('NUXT_SENTRY_DSN is not a valid DSN: error reporting is off')
  if (!dsn) return OFF
  const send = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const limit = options.maxPerMinute ?? 30
  let windowStart = now()
  let sent = 0
  return {
    enabled: true,
    capture(error, tags) {
      if (now() - windowStart >= 60_000) {
        windowStart = now()
        sent = 0
      }
      if (sent >= limit) return
      sent += 1
      try {
        const request = buildErrorEnvelope(dsn, { error, tags: { service: 'web', ...tags }, environment: options.environment })
        void send(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }).then(
          (response) => {
            if (!response.ok) options.onProblem?.(`error collector answered ${response.status}`)
          },
          () => options.onProblem?.('error collector unreachable'),
        )
      } catch {
        options.onProblem?.('error report could not be built')
      }
    },
  }
}

/** Only server faults are reported: a 404 or a 400 is the visitor's, not ours. */
export const isServerFault = (error: unknown): boolean => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status !== 'number' || status >= 500
}
