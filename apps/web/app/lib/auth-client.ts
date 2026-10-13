import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

/** Same-origin base path of the Better Auth routes (forwarded to the api by `server/routes/api/[...path].ts`). */
export const AUTH_BASE_PATH = '/api/auth'

const build = (baseURL: string, headers?: Readonly<Record<string, string>>) =>
  createAuthClient({
    baseURL,
    basePath: AUTH_BASE_PATH,
    plugins: [organizationClient()],
    ...(headers ? { fetchOptions: { headers } } : {}),
  })

export type AuthClient = ReturnType<typeof build>

export const buildAuthClient = (baseURL: string, headers?: Readonly<Record<string, string>>): AuthClient => build(baseURL, headers)

/** Headers of the SSR auth client: the SSR transport headers (cookie, client IP) plus the site's own origin, which Better Auth requires on state-changing calls. */
export const ssrAuthHeaders = (transport: Readonly<Record<string, string>>, siteUrl: string): Record<string, string> => ({ ...transport, origin: siteUrl })
