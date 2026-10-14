import { createWebErrorReporter, isServerFault } from '../lib/web-error-reporter'

/**
 * Optional error reporting (`NUXT_SENTRY_DSN`): off, and nothing sent anywhere, when it is empty. Server faults only,
 * with the request id as a tag so the report can be matched with the api and worker logs.
 */
export default defineNitroPlugin((nitroApp) => {
  const { sentryDsn } = useRuntimeConfig()
  const reporter = createWebErrorReporter({
    dsn: String(sentryDsn ?? ''),
    environment: process.env.NODE_ENV,
    onProblem: (reason) => console.warn('[error-reporting]', reason),
  })
  if (!reporter.enabled) return
  nitroApp.hooks.hook('error', (error, { event }) => {
    if (!isServerFault(error)) return
    const requestId: unknown = event?.context.requestId
    reporter.capture(error, { request_id: typeof requestId === 'string' ? requestId : undefined })
  })
})
