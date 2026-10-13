import { checkForm, snapshotOf, type JobForm } from '@/lib/job-form'

/**
 * Editor state: the form (replaced, never mutated), whether it differs from what was last saved, and the local
 * rule check recomputed on every change. Cheap and synchronous: no api call happens here.
 */
export const useJobDraft = (initial: JobForm) => {
  const form = ref<JobForm>(initial)
  const baseline = ref(snapshotOf(initial))
  const dirty = computed(() => snapshotOf(form.value) !== baseline.value)
  const check = computed(() => checkForm(form.value))

  const patch = (changes: Partial<JobForm>): void => {
    form.value = { ...form.value, ...changes }
  }
  /** Remember `saved` as the clean state (what was sent, not what is being typed now). */
  const markSaved = (saved: JobForm): void => {
    baseline.value = snapshotOf(saved)
  }

  return { form, dirty, check, patch, markSaved }
}
