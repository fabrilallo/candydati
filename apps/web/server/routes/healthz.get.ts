import { defineEventHandler, setResponseHeader } from 'h3'

/**
 * Liveness of the web server itself: it answers without calling the api, so a restart of the api never makes the
 * orchestrator kill the web container. `/api/health` and `/api/ready` (proxied to the api) are the checks of the chain.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return { status: 'ok' }
})
