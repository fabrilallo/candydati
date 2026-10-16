import type { ImportConfidence, ImportField } from '@candydati/domain'
import { emptyMapping, mappingChanged, setHeaderField } from '@/lib/import-mapping'
import { setByConfidence, toggleItem, type PreviewFilters } from '@/lib/import-preview'
import type { WizardStep } from '@/lib/import-view'
import type { WizardBusy } from './useImportWizardActions'

/**
 * Steps 2 to 5 of an import and its result, for one batch. The step follows the batch status when the worker is on
 * it; between "Colonne", "Anteprima" and "Conferma" the user moves. Mapping and selection stay on the client until
 * the user moves on, then go to the api in one call.
 */
export const useImportWizard = (batchId: string) => {
  const request = useJobsApi()
  const { data, refresh, detail, step, mapping, selection, resumeAt, reload } = useImportBatchState(batchId, request)
  const filters = ref<PreviewFilters>({ confidence: 'all', problem: 'all' })
  const busy = ref<WizardBusy>(null)

  usePollWhileWorking(detail, reload)

  const original = computed(() => detail.value?.batch.mapping ?? emptyMapping())
  const changedMapping = computed(() => mappingChanged(original.value, mapping.value))

  const { applyMapping, toConfirm, commit } = useImportWizardActions({ batchId, request, detail, step, mapping, selection, busy, resumeAt, changedMapping, reload })

  return {
    detail: computed(() => detail.value),
    errorKey: computed(() => (detail.value ? null : (data.value?.errorKey ?? null))),
    step,
    mapping: computed(() => mapping.value),
    selection: computed(() => selection.value),
    filters,
    busy: computed(() => busy.value),
    changedMapping,
    refresh,
    setField: (header: string, field: ImportField | null): void => {
      mapping.value = setHeaderField(mapping.value, header, field)
    },
    resetMapping: (): void => {
      mapping.value = original.value
    },
    toggle: (id: string, include: boolean): void => {
      selection.value = toggleItem(selection.value, id, include)
    },
    bulk: (confidence: ImportConfidence, include: boolean): void => {
      selection.value = setByConfidence(selection.value, detail.value?.items ?? [], confidence, include)
    },
    applyMapping,
    toConfirm,
    commit,
    goTo: (next: WizardStep): void => {
      step.value = next
    },
  }
}
