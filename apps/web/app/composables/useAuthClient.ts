import { buildAuthClient, type AuthClient } from '@/lib/auth-client'

const onlyStrings = (headers: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

/**
 * Better Auth client on the same origin: `/api/auth` is forwarded to the api, so the session cookie stays first-party.
 * In the browser one instance is enough; during SSR a fresh instance per request forwards the incoming cookies
 * and talks to the api directly (never shared between requests). It declares the site's own origin: Better Auth
 * refuses state-changing calls without a trusted Origin, and SSR may need one (activating the organization of a
 * session that has none yet).
 */
export const useAuthClient = (): AuthClient => {
  if (import.meta.server) {
    const config = useRuntimeConfig()
    return buildAuthClient(config.apiInternalUrl, { ...onlyStrings(useRequestHeaders(['cookie'])), origin: config.public.siteUrl })
  }
  const app = useNuxtApp() as { _authClient?: AuthClient }
  app._authClient ??= buildAuthClient(window.location.origin)
  return app._authClient
}
