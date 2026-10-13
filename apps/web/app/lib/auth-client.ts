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
