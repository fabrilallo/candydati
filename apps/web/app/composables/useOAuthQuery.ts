import { oauthQueryOf } from '@/lib/oauth-flow'

const searchOf = (fullPath: string): string => {
  const start = fullPath.indexOf('?')
  return start === -1 ? '' : fullPath.slice(start)
}

/**
 * The signed authorization request of the current OAuth page: the address bar's own query (byte for byte, as the server
 * wrote it) when it belongs to this route, else the router's copy (same parameters). `null` when there is none.
 */
export const useOAuthQuery = (): string | null => {
  const route = useRoute()
  const fromBar = import.meta.client && window.location.pathname === route.path ? window.location.search : ''
  return oauthQueryOf(fromBar || searchOf(route.fullPath))
}
