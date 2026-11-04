import { errorKeyOf } from '@/lib/auth-errors'
import { suggestScorecard, type ScorecardSuggestion } from '@/lib/scorecard-api'

/** Criteria drafted from the ad, on demand (a model call costs money). Nothing is saved: the person picks what to add. */
export const useScorecardSuggestions = (jobId: string) => {
  const request = useJobsApi()
  const proposals = ref<readonly string[]>([])
  const pending = ref(false)
  const errorKey = ref<string | null>(null)
  const outcome = ref<ScorecardSuggestion['status'] | null>(null)

  const ask = async (): Promise<void> => {
    pending.value = true
    errorKey.value = null
    try {
      const result = await suggestScorecard(request, jobId)
      outcome.value = result.status
      proposals.value = result.criteria
    } catch (error) {
      outcome.value = null
      proposals.value = []
      errorKey.value = errorKeyOf(error)
    } finally {
      pending.value = false
    }
  }
  const take = (labels: readonly string[]): void => {
    proposals.value = proposals.value.filter((label) => !labels.includes(label))
  }
  const dismiss = (): void => {
    proposals.value = []
    outcome.value = null
    errorKey.value = null
  }
  return { proposals, pending, errorKey, outcome, ask, take, dismiss }
}
