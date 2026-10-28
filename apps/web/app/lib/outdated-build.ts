/** How often an open tab asks the server whether a newer build was deployed (Nuxt's app manifest check). */
export const OUTDATED_BUILD_CHECK_INTERVAL_MS = 5 * 60 * 1000

interface Place {
  readonly path: string
  readonly fullPath: string
}

/**
 * Pure: reload the whole page on this navigation? Only when a newer build is known and the user is really moving to
 * another page (query or hash changes on the same path keep the page, and any unsaved input, as it is).
 */
export const shouldReloadOnNavigation = (outdated: boolean, to: Place, from: Place): boolean => outdated && to.path !== from.path
