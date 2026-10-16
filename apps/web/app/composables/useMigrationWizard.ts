import type { MigrationDeclarationsInput, MigrationStageTarget } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { commitMigration, saveMigrationChoices, undoMigration } from '@/lib/migration-api'
import type { MigrationStep } from '@/lib/migration-view'

/**
 * One migration through the wizard: the choices of the stages step are saved as they are made (each answer is the batch
 * as it now stands), then the confirmation with the three declarations, and the undo.
 */
export const useMigrationWizard = (migrationId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh, batch, step, reload } = useMigrationBatchState(migrationId, request)
  const { busy, errorKey, refusal, run } = useMigrationRunner(reload)

  const choose = async (input: Parameters<typeof saveMigrationChoices>[2]): Promise<void> => {
    const saved = await run('choices', () => saveMigrationChoices(request, migrationId, input))
    if (saved) batch.value = saved
  }

  const confirm = async (declarations: MigrationDeclarationsInput): Promise<boolean> => {
    const saved = await run('commit', () => commitMigration(request, migrationId, declarations))
    if (!saved) return false
    batch.value = saved
    step.value = 'result'
    return true
  }

  const undo = async (): Promise<boolean> => {
    const result = await run('undo', () => undoMigration(request, migrationId))
    if (!result) return false
    batch.value = result.batch
    step.value = 'result'
    toast.success(t('migrations.undo.done'))
    return true
  }

  return {
    batch: computed(() => batch.value),
    errorKey: computed(() => (batch.value ? null : (data.value?.errorKey ?? null))),
    actionErrorKey: computed(() => errorKey.value),
    refusal: computed(() => refusal.value),
    step,
    busy: computed(() => busy.value),
    refresh,
    goTo: (next: MigrationStep): void => {
      step.value = next
    },
    /** One choice for every stage with this source name, in every job. */
    chooseByName: (name: string, type: MigrationStageTarget): Promise<void> => choose({ stageNames: [{ name, type }] }),
    chooseStage: (jobRef: string, stageRef: string, type: MigrationStageTarget, title: string): Promise<void> => choose({ stageMapping: [{ jobRef, stageRef, type, title }] }),
    setExcludedJobs: (excludedJobs: readonly string[]): Promise<void> => choose({ excludedJobs: [...excludedJobs] }),
    confirm,
    undo,
  }
}
