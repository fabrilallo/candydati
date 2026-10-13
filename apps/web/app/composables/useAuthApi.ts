import { createAuthApi, type AuthApi } from '@/lib/auth-api'

/** Validated Better Auth adapter bound to the same-origin client. The one thing screens (and tests) mock. */
export const useAuthApi = (): AuthApi => createAuthApi(useAuthClient())
