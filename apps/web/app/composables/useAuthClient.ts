import { buildAuthClient, type AuthClient } from '@/lib/auth-client'

const onlyStrings = (headers: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

/**
 * Better Auth client on the same origin: `/api/auth` is forwarded to the api, so the session cookie stays first-party.
 * In the browser one instance is enough; during SSR a fresh instance per request forwards the incoming cookies
 * and talks to the api directly (never shared between requests).
 */
export const useAuthClient = (): AuthClient => {
  if (import.meta.server) return buildAuthClient(useRuntimeConfig().apiInternalUrl, onlyStrings(useRequestHeaders(['cookie'])))
  const app = useNuxtApp() as { _authClient?: AuthClient }
  app._authClient ??= buildAuthClient(window.location.origin)
  return app._authClient
}
