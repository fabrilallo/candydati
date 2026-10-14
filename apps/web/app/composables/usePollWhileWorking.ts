import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import type { ImportDetail } from '@/lib/import-item-view'
import { isWorking } from '@/lib/import-view'

/** How often a batch is asked again while the worker analyzes or imports it. */
export const IMPORT_POLL_MS = 3_000

/** Reloads a batch on an interval while the worker is on it and the tab is visible. Returns whether it is working. */
export const usePollWhileWorking = (detail: Ref<ImportDetail | null>, reload: () => Promise<void>) => {
  const visibility = useDocumentVisibility()
  const working = computed(() => detail.value !== null && isWorking(detail.value.batch.status))
  const { pause, resume } = useIntervalFn(() => void reload(), IMPORT_POLL_MS, { immediate: false })
  const follow = (): void => {
    if (working.value && visibility.value === 'visible') resume()
    else pause()
  }
  onMounted(follow)
  watch([working, visibility], follow)
  onBeforeUnmount(pause)
  return working
}
