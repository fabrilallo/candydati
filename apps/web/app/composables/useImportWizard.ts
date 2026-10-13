import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { commitImport, getImport, saveItems, saveMapping } from '@/lib/import-api'
import { emptyMapping, mappingChanged, setHeaderField } from '@/lib/import-mapping'
import { initialSelection, selectionChanges, setByConfidence, toggleItem, type PreviewFilters, type Selection } from '@/lib/import-preview'
import { isWorking, wizardStep, type WizardStep } from '@/lib/import-view'
import { loaded } from '@/lib/job-api'
import type { Confidence, ImportDetailDto, ImportMapping, MappingField } from '@/lib/phase8-contract'

/** How often a batch is asked again while the worker analyzes or imports it. */
export const IMPORT_POLL_MS = 3_000

export type WizardBusy = 'mapping' | 'items' | 'commit' | null

/**
 * Steps 2 to 5 of an import and its result, for one batch. The step follows the batch status when the worker is on
 * it; between "Colonne", "Anteprima" and "Conferma" the user moves. Mapping and selection stay on the client until
 * the user moves on, then go to the api in one call.
 */
export const useImportWizard = (batchId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useAsyncData(`import-${batchId}`, () => loaded(() => getImport(request, batchId)))
  const detail = ref<ImportDetailDto | null>(data.value?.data ?? null)
  const step = ref<WizardStep>(detail.value ? wizardStep(detail.value.batch.status) : 'analysis')
  const mapping = ref<ImportMapping>(detail.value?.batch.mapping ?? emptyMapping())
  const selection = ref<Selection>(initialSelection(detail.value?.items ?? []))
  const filters = ref<PreviewFilters>({ confidence: 'all', problem: 'all' })
  const busy = ref<WizardBusy>(null)
  /** Where a batch that becomes ready again goes: the preview after a new mapping, "Colonne" otherwise. */
  const resumeAt = ref<WizardStep | null>(null)
  const stepFor = (status: ImportDetailDto['batch']['status']): WizardStep => (status === 'ready' && resumeAt.value ? resumeAt.value : wizardStep(status))

  const adopt = (fresh: ImportDetailDto, nextStep?: WizardStep): void => {
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

  const original = computed(() => detail.value?.batch.mapping ?? emptyMapping())
  const changedMapping = computed(() => mappingChanged(original.value, mapping.value))

  /** Leaves "Colonne": an edited mapping goes to the api, which matches again (the batch analyzes for a moment). */
  const applyMapping = (): Promise<void> =>
    run('mapping', async () => {
      if (!changedMapping.value) {
        step.value = 'preview'
        return
      }
      resumeAt.value = 'preview'
      const saved = await saveMapping(request, batchId, mapping.value)
      if (detail.value) detail.value = { ...detail.value, batch: { ...detail.value.batch, status: saved.status as ImportDetailDto['batch']['status'] } }
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
      if (detail.value) detail.value = { ...detail.value, batch: { ...detail.value.batch, status: saved.status as ImportDetailDto['batch']['status'] } }
      step.value = 'result'
      await reload('result')
    })

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
    setField: (header: string, field: MappingField | null): void => {
      mapping.value = setHeaderField(mapping.value, header, field)
    },
    resetMapping: (): void => {
      mapping.value = original.value
    },
    toggle: (id: string, include: boolean): void => {
      selection.value = toggleItem(selection.value, id, include)
    },
    bulk: (confidence: Confidence, include: boolean): void => {
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
