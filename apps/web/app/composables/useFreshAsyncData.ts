import type { AsyncDataOptions } from '#app'
import { isReusedEntry, shouldRefetchOnFocus } from '@/lib/freshness'

type FreshOptions<T> = AsyncDataOptions<T> & {
  /** Also refetch when the tab or window comes back into focus (boards, work queues). */
  readonly refetchOnFocus?: boolean
}

/**
 * `useAsyncData` for lists, boards and detail screens whose data changes elsewhere. Nuxt serves an entry it already
 * holds (`status === 'success'`) without calling the handler again, so a screen opened after an earlier visit showed
 * old data until a full reload. Here an entry reused on client-side navigation is refetched right after mount (never
 * during hydration: the server payload is what the markup was rendered from, so no mismatch), and, if asked, the data
 * is refetched when the window regains focus.
 */
export const useFreshAsyncData = <T>(key: string | (() => string), handler: () => Promise<T>, options: FreshOptions<T> = {}) => {
  const { refetchOnFocus = false, ...rest } = options
  const result = useAsyncData(key, handler, rest)
  if (!import.meta.client) return result

  const reused = isReusedEntry(useNuxtApp().isHydrating === true, result.status.value)
  let lastFetchedAt = Date.now()
  watch(result.status, (status) => {
    if (status === 'success' || status === 'error') lastFetchedAt = Date.now()
  })
  onMounted(() => {
    if (reused) void result.refresh()
  })
  if (refetchOnFocus) {
    const refetch = (): void => {
      if (document.visibilityState === 'hidden') return
      if (shouldRefetchOnFocus({ status: result.status.value, lastFetchedAt, now: Date.now() })) void result.refresh()
    }
    useEventListener(window, 'focus', refetch)
    useEventListener(document, 'visibilitychange', refetch)
  }
  return result
}
