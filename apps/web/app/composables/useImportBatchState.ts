import type { ImportMapping } from '@candydati/domain'
import type { ImportDetail } from '@/lib/import-item-view'
import { getImport } from '@/lib/import-api'
import { emptyMapping } from '@/lib/import-mapping'
import { initialSelection, type Selection } from '@/lib/import-preview'
import { isWorking, wizardStep, type WizardStep } from '@/lib/import-view'
import { loaded } from '@/lib/job-api'

/** The loaded batch, the wizard step that follows its status, and the client-side mapping and selection. */
export const useImportBatchState = (batchId: string, request: ReturnType<typeof useJobsApi>) => {
  const { data, refresh } = useFreshAsyncData(`import-${batchId}`, () => loaded(() => getImport(request, batchId)))
  const detail = ref<ImportDetail | null>(data.value?.data ?? null)
  const step = ref<WizardStep>(detail.value ? wizardStep(detail.value.batch.status) : 'analysis')
  const mapping = ref<ImportMapping>(detail.value?.batch.mapping ?? emptyMapping())
  const selection = ref<Selection>(initialSelection(detail.value?.items ?? []))
  /** Where a batch that becomes ready again goes: the preview after a new mapping, "Colonne" otherwise. */
  const resumeAt = ref<WizardStep | null>(null)
  const stepFor = (status: ImportDetail['batch']['status']): WizardStep => (status === 'ready' && resumeAt.value ? resumeAt.value : wizardStep(status))

  const adopt = (fresh: ImportDetail, nextStep?: WizardStep): void => {
    const wasWorking = detail.value ? isWorking(detail.value.batch.status) : true
    detail.value = fresh
    mapping.value = fresh.batch.mapping ?? emptyMapping()
    selection.value = initialSelection(fresh.items)
    if (nextStep) step.value = nextStep
    else if (wasWorking || isWorking(fresh.batch.status)) step.value = stepFor(fresh.batch.status)
  }
  watch(data, (fresh) => {
    if (fresh?.data) adopt(fresh.data)
  })

  const reload = async (nextStep?: WizardStep): Promise<void> => {
    try {
      adopt(await getImport(request, batchId), nextStep)
    } catch (error) {
      console.error('[import] reload failed', error instanceof Error ? error.message : error)
    }
  }

  return { data, refresh, detail, step, mapping, selection, resumeAt, reload }
}
