import type { ImportMapping } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { commitImport, saveItems, saveMapping } from '@/lib/import-api'
import type { ImportDetail } from '@/lib/import-item-view'
import { selectionChanges, type Selection } from '@/lib/import-preview'
import { isWorking, type WizardStep } from '@/lib/import-view'

export type WizardBusy = 'mapping' | 'items' | 'commit' | null

interface WizardActionsContext {
  readonly batchId: string
  readonly request: ReturnType<typeof useJobsApi>
  readonly detail: Ref<ImportDetail | null>
  readonly step: Ref<WizardStep>
  readonly mapping: Ref<ImportMapping>
  readonly selection: Ref<Selection>
  readonly busy: Ref<WizardBusy>
  readonly resumeAt: Ref<WizardStep | null>
  readonly changedMapping: Ref<boolean>
  readonly reload: (nextStep?: WizardStep) => Promise<void>
}

/** The calls that move an import wizard forward: save the mapping, save the selection, commit. */
export const useImportWizardActions = (ctx: WizardActionsContext) => {
  const { t } = useI18n()
  const { batchId, request, detail, step, mapping, selection, busy, resumeAt, changedMapping, reload } = ctx
  const run = async (kind: Exclude<WizardBusy, null>, action: () => Promise<void>): Promise<void> => {
    busy.value = kind
    try {
      await action()
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      busy.value = null
    }
  }

  /** Leaves "Colonne": an edited mapping goes to the api, which matches again (the batch analyzes for a moment). */
  const applyMapping = (): Promise<void> =>
    run('mapping', async () => {
      if (!changedMapping.value) {
        step.value = 'preview'
        return
      }
      resumeAt.value = 'preview'
      const saved = await saveMapping(request, batchId, mapping.value)
      if (detail.value) detail.value = { ...detail.value, batch: { ...detail.value.batch, status: saved.status } }
      await reload(isWorking(detail.value?.batch.status ?? 'ready') ? 'analysis' : 'preview')
    })

  /** Leaves "Anteprima": only the include/exclude changes go to the api. */
  const toConfirm = (): Promise<void> =>
    run('items', async () => {
      const changes = selectionChanges(detail.value?.items ?? [], selection.value)
      if (changes.items.length > 0) await saveItems(request, batchId, changes)
      if (detail.value) {
        const items = detail.value.items.map((item) => ({ ...item, included: selection.value.has(item.id) }))
        detail.value = { ...detail.value, items }
      }
      step.value = 'confirm'
    })

  const commit = (): Promise<void> =>
    run('commit', async () => {
      const saved = await commitImport(request, batchId)
      if (detail.value) detail.value = { ...detail.value, batch: { ...detail.value.batch, status: saved.status } }
      step.value = 'result'
      await reload('result')
    })

  return { applyMapping, toConfirm, commit }
}
