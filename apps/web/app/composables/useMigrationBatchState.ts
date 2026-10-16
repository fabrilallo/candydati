import type { MigrationBatchDto } from '@candydati/domain'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { loaded } from '@/lib/job-api'
import { getMigration } from '@/lib/migration-api'
import { isWorking, stepOf, type MigrationStep } from '@/lib/migration-view'

/** How often a migration is asked again while the worker is on it. */
export const MIGRATION_POLL_MS = 3_000

/** Between the preview and the confirmation the person moves; every other step follows the status of the migration. */
const EDITING: readonly MigrationStep[] = ['preview', 'stages', 'confirm']
const reconcile = (step: MigrationStep, batch: MigrationBatchDto): MigrationStep => (batch.status === 'ready' && EDITING.includes(step) ? step : stepOf(batch))

/** The loaded migration, the wizard step that follows its status, and the polling while the worker is on it. */
export const useMigrationBatchState = (migrationId: string, request: ReturnType<typeof useJobsApi>) => {
  const { data, refresh } = useFreshAsyncData(`migration-${migrationId}`, () => loaded(() => getMigration(request, migrationId)))
  const batch = ref<MigrationBatchDto | null>(data.value?.data ?? null)
  const step = ref<MigrationStep>(batch.value ? stepOf(batch.value) : 'analysis')

  const adopt = (fresh: MigrationBatchDto): void => {
    batch.value = fresh
    step.value = reconcile(step.value, fresh)
  }
  watch(data, (fresh) => {
    if (fresh?.data) adopt(fresh.data)
  })

  const reload = async (): Promise<void> => {
    try {
      adopt(await getMigration(request, migrationId))
    } catch (error) {
      console.error('[migration] reload failed', error instanceof Error ? error.message : error)
    }
  }

  const visibility = useDocumentVisibility()
  const working = computed(() => batch.value !== null && isWorking(batch.value.status))
  const { pause, resume } = useIntervalFn(() => void reload(), MIGRATION_POLL_MS, { immediate: false })
  const follow = (): void => {
    if (working.value && visibility.value === 'visible') resume()
    else pause()
  }
  onMounted(follow)
  watch([working, visibility], follow)
  onBeforeUnmount(pause)

  return { data, refresh, batch, step, reload }
}
