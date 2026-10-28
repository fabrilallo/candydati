import { shouldReloadOnNavigation } from '@/lib/outdated-build'

/**
 * A tab opened before a deploy keeps its old bundle. Nuxt's app manifest tells us when a newer build exists
 * (`app:manifest:update`); we then reload on the next navigation, never mid-page, so typed input is not lost.
 * Chunk load failures after a deploy are reloaded by Nuxt itself (`experimental.emitRouteChunkError: 'automatic'`).
 */
export default defineNuxtPlugin((nuxtApp) => {
  let outdated = false
  nuxtApp.hook('app:manifest:update', () => {
    outdated = true
  })
  useRouter().beforeEach((to, from) => {
    if (!shouldReloadOnNavigation(outdated, to, from)) return
    reloadNuxtApp({ path: to.fullPath, persistState: false })
    return false
  })
})
