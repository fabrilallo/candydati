import type { ImportBatchDto } from '@tt/domain'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { listImports, undoImport } from '@/lib/import-api'
import { isWorking } from '@/lib/import-view'
import { loaded } from '@/lib/job-api'

/** How often the list is asked again while a batch is being analyzed or imported. */
export const IMPORTS_POLL_MS = 5_000

const byNewest = (a: ImportBatchDto, b: ImportBatchDto): number => b.createdAt.localeCompare(a.createdAt)

/**
 * The organization's import batches (`import:manage`). Polled only while the worker is on one, with the tab
 * visible. Undo erases what the batch created; the api reports how many reconfirmed candidates it kept.
 */
export const useImports = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('imports', () => loaded(() => listImports(request)))
  // Polled lists override the first load; a computed (not a watcher) so the server render and hydration agree.
  const polled = ref<readonly ImportBatchDto[] | null>(null)
  watch(data, () => {
    polled.value = null
  })
  const items = computed(() => polled.value ?? data.value?.data ?? null)
  const undoing = ref<string | null>(null)
  const visibility = useDocumentVisibility()

  const poll = async (): Promise<void> => {
    try {
      polled.value = await listImports(request)
    } catch (error) {
      console.error('[imports] poll failed', error instanceof Error ? error.message : error)
    }
  }
  const { pause, resume } = useIntervalFn(() => void poll(), IMPORTS_POLL_MS, { immediate: false })
  const working = computed(() => (items.value ?? []).some((batch) => isWorking(batch.status)))
  const follow = (): void => {
    if (working.value && visibility.value === 'visible') resume()
    else pause()
  }
  onMounted(follow)
  watch([working, visibility], follow)
  onBeforeUnmount(pause)

  const undo = async (batchId: string): Promise<boolean> => {
    undoing.value = batchId
    try {
      const result = await undoImport(request, batchId)
      toast.success(result.skippedReconfirmed > 0 ? t('imports.undo.doneKept', { count: result.skippedReconfirmed }, result.skippedReconfirmed) : t('imports.undo.done'))
      await poll()
      return true
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return false
    } finally {
      undoing.value = null
    }
  }

  return {
    items: computed(() => (items.value ? items.value.toSorted(byNewest) : null)),
    errorKey: computed(() => (items.value ? null : (data.value?.errorKey ?? null))),
    undoing: computed(() => undoing.value),
    refresh,
    undo,
  }
}
