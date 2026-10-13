import { buildAuthClient, ssrAuthHeaders, type AuthClient } from '@/lib/auth-client'

/**
 * Better Auth client on the same origin: `/api/auth` is forwarded to the api, so the session cookie stays first-party.
 * In the browser one instance is enough; during SSR a fresh instance per request forwards the incoming cookies
 * and talks to the api directly (never shared between requests). It declares the site's own origin: Better Auth
 * refuses state-changing calls without a trusted Origin, and SSR may need one (activating the organization of a
 * session that has none yet).
 */
export const useAuthClient = (): AuthClient => {
  if (import.meta.server) {
    const { baseURL, headers } = useApiTransport()
    return buildAuthClient(baseURL ?? '', ssrAuthHeaders(headers, useRuntimeConfig().public.siteUrl))
  }
  const app = useNuxtApp() as { _authClient?: AuthClient }
  app._authClient ??= buildAuthClient(window.location.origin)
  return app._authClient
}
