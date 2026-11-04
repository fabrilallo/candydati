import type { ComputedRef } from 'vue'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { moveItem, removeItem, replaceItem } from '@/lib/job-form'
import { attempt } from '@/lib/load-result'
import { getScorecard, putScorecard } from '@/lib/scorecard-api'
import { addLabels, checkCriteria, criteriaDrafts, newCriterion, scorecardBody, type CriteriaCheck, type CriterionDraft } from '@/lib/scorecard-form'

type Changes = Partial<Pick<CriterionDraft, 'label' | 'stageId'>>

/** The list operations of the editor, each giving the next list to `set`. A locked criterion keeps its words. */
const criteriaEdits = (drafts: ComputedRef<readonly CriterionDraft[]>, set: (next: readonly CriterionDraft[]) => void) => {
  let counter = 0
  const nextKey = (): string => `new-${++counter}`
  return {
    add: (): void => set([...drafts.value, newCriterion(nextKey())]),
    addFrom: (labels: readonly string[]): void => set(addLabels(drafts.value, labels, nextKey)),
    remove: (index: number): void => set(removeItem(drafts.value, index)),
    move: (index: number, delta: -1 | 1): void => set(moveItem(drafts.value, index, delta)),
    patch: (index: number, changes: Changes): void => {
      const current = drafts.value[index]
      if (current && !current.locked) set(replaceItem(drafts.value, index, { ...current, ...changes }))
    },
  }
}

/**
 * The evaluation criteria of a job (PRODUCT.md §2.4), edited as a list and saved with one button: the list replaces the
 * active criteria. The screen shows what the api answered.
 */
export const useJobScorecard = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`job-scorecard-${jobId}`, () => attempt(() => getScorecard(request, jobId)))
  /** The last list the api answered with, then the person's edits on top of it. */
  const saved = ref<readonly CriterionDraft[] | null>(null)
  const edited = ref<readonly CriterionDraft[] | null>(null)
  const base = computed<readonly CriterionDraft[]>(() => saved.value ?? (data.value?.data ? criteriaDrafts(data.value.data) : []))
  const drafts = computed<readonly CriterionDraft[]>(() => edited.value ?? base.value)
  const check = ref<CriteriaCheck>({ ok: true, errors: {} })
  const saving = ref(false)
  const saveErrorKey = ref<string | null>(null)
  const edits = criteriaEdits(drafts, (next) => {
    edited.value = next
    if (!check.value.ok) check.value = checkCriteria(next)
  })

  const save = async (): Promise<boolean> => {
    check.value = checkCriteria(drafts.value)
    saveErrorKey.value = null
    if (!check.value.ok) return false
    saving.value = true
    try {
      saved.value = criteriaDrafts(await putScorecard(request, jobId, scorecardBody(drafts.value)))
      edited.value = null
      toast.success(t('job.scorecard.saved'))
      return true
    } catch (error) {
      saveErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    drafts,
    errors: computed(() => check.value.errors),
    loaded: computed(() => Boolean(data.value?.data)),
    errorKey: computed(() => data.value?.errorKey ?? null),
    saveErrorKey: computed(() => saveErrorKey.value),
    dirty: computed(() => edited.value !== null && JSON.stringify(scorecardBody(edited.value)) !== JSON.stringify(scorecardBody(base.value))),
    saving: computed(() => saving.value),
    ...edits,
    save,
    refresh,
  }
}
