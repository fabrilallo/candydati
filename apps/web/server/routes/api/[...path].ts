import { isApiPath } from '../../lib/api-proxy'
import { forwardToApi } from '../../lib/forward'

/**
 * `/api/**` on the web origin, forwarded to the Fastify api (`NUXT_API_INTERNAL_URL`, read at runtime):
 * the browser only ever talks to this origin, so Better Auth cookies stay first-party.
 */
export default forwardToApi(isApiPath)
