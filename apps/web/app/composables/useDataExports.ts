import type { DataExportDto } from '@tt/domain'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { createDataExport, listDataExports } from '@/lib/gdpr-api'
import { hasPreparing } from '@/lib/gdpr-view'
import { loaded } from '@/lib/job-api'

/** How often the list is asked again while an export is being prepared. */
export const EXPORT_POLL_MS = 5_000

const byNewest = (a: DataExportDto, b: DataExportDto): number => b.createdAt.localeCompare(a.createdAt)

/**
 * The organization exports (`data:export`). While one is being prepared the list is polled, only with the tab
 * visible; it stops by itself once everything is ready, expired or failed.
 */
export const useDataExports = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('data-exports', () => loaded(() => listDataExports(request)))
  // Polled or just-created lists override the first load; a computed (not a watcher) so the server render and hydration agree.
  const override = ref<readonly DataExportDto[] | null>(null)
  watch(data, () => {
    override.value = null
  })
  const items = computed(() => override.value ?? data.value?.data ?? null)
  const creating = ref(false)
  const visibility = useDocumentVisibility()

  const poll = async (): Promise<void> => {
    try {
      override.value = await listDataExports(request)
    } catch (error) {
      console.error('[exports] poll failed', error instanceof Error ? error.message : error)
    }
  }
  const { pause, resume } = useIntervalFn(() => void poll(), EXPORT_POLL_MS, { immediate: false })
  const preparing = computed(() => items.value !== null && hasPreparing(items.value, new Date()))
  const follow = (): void => {
    if (preparing.value && visibility.value === 'visible') resume()
    else pause()
  }
  onMounted(follow)
  watch([preparing, visibility], follow)
  onBeforeUnmount(pause)

  const create = async (): Promise<void> => {
    creating.value = true
    try {
      const created = await createDataExport(request)
      const now = new Date().toISOString()
      const placeholder: DataExportDto = { id: created.id, status: created.status, sizeBytes: null, createdAt: now, completedAt: null, expiresAt: now }
      override.value = [placeholder, ...(items.value ?? []).filter((item) => item.id !== created.id)]
      toast.success(t('dataExport.created'))
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      creating.value = false
    }
  }

  return {
    items: computed(() => (items.value ? items.value.toSorted(byNewest) : null)),
    errorKey: computed(() => (items.value ? null : (data.value?.errorKey ?? null))),
    preparing,
    creating: computed(() => creating.value),
    refresh,
    create,
  }
}
