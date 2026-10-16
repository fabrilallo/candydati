import type { MigrationBatchDto } from '@candydati/domain'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { listMigrations, undoMigration } from '@/lib/migration-api'
import { isWorking } from '@/lib/migration-view'
import { loaded } from '@/lib/job-api'

/** How often the list is asked again while a migration is being analysed or written. */
export const MIGRATIONS_POLL_MS = 5_000

const byNewest = (a: MigrationBatchDto, b: MigrationBatchDto): number => b.createdAt.localeCompare(a.createdAt)

/**
 * The organization's migrations (`migration:manage`). Polled only while the worker is on one, with the tab visible.
 * The undo answers with what it erased and what it kept.
 */
export const useMigrations = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('migrations', () => loaded(() => listMigrations(request)))
  // Polled lists override the first load; a computed (not a watcher) so the server render and hydration agree.
  const polled = ref<readonly MigrationBatchDto[] | null>(null)
  watch(data, () => {
    polled.value = null
  })
  const items = computed(() => polled.value ?? data.value?.data ?? null)
  const undoing = ref<string | null>(null)
  const visibility = useDocumentVisibility()

  const poll = async (): Promise<void> => {
    try {
      polled.value = await listMigrations(request)
    } catch (error) {
      console.error('[migrations] poll failed', error instanceof Error ? error.message : error)
    }
  }
  const { pause, resume } = useIntervalFn(() => void poll(), MIGRATIONS_POLL_MS, { immediate: false })
  const working = computed(() => (items.value ?? []).some((batch) => isWorking(batch.status)))
  const follow = (): void => {
    if (working.value && visibility.value === 'visible') resume()
    else pause()
  }
  onMounted(follow)
  watch([working, visibility], follow)
  onBeforeUnmount(pause)

  const undo = async (id: string): Promise<boolean> => {
    undoing.value = id
    try {
      await undoMigration(request, id)
      toast.success(t('migrations.undo.done'))
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
