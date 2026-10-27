import type { AdQualityAssessment, JobContent } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { analyzeQuality, type JobApiRequest } from '@/lib/job-api'
import { toQualityView } from '@/lib/quality-view'

/**
 * On-demand quality analysis (a model call costs money: never on keystroke). Remembers which form snapshot was
 * analysed so the panel can say the result is out of date. Without a language model there is no score at all
 * (PRODUCT.md §4.3): `unavailable` says so, and the panel explains where AI is turned on.
 */
export const useJobQuality = (api: JobApiRequest, currentSnapshot: () => string) => {
  const assessment = ref<AdQualityAssessment | null>(null)
  const analysedSnapshot = ref<string | null>(null)
  const pending = ref(false)
  const errorKey = ref<string | null>(null)
  const unavailable = ref(false)

  const set = (next: AdQualityAssessment, snapshot: string): void => {
    assessment.value = next
    analysedSnapshot.value = snapshot
    unavailable.value = false
  }

  /** No model on the instance: whatever was shown before is not a score any more. */
  const markUnavailable = (): void => {
    assessment.value = null
    analysedSnapshot.value = null
    unavailable.value = true
  }

  /** Resolves with the assessment, or `null` when there is no score or the analysis could not run (publishing never waits on it). */
  const analyze = async (content: JobContent, snapshot: string): Promise<AdQualityAssessment | null> => {
    pending.value = true
    errorKey.value = null
    try {
      const result = await analyzeQuality(api, content)
      if (result.assessment === null) {
        markUnavailable()
        return null
      }
      set(result.assessment, snapshot)
      return result.assessment
    } catch (error) {
      errorKey.value = errorKeyOf(error)
      return null
    } finally {
      pending.value = false
    }
  }

  return {
    assessment,
    view: computed(() => (assessment.value ? toQualityView(assessment.value) : null)),
    stale: computed(() => analysedSnapshot.value !== null && analysedSnapshot.value !== currentSnapshot()),
    pending,
    errorKey,
    unavailable: computed(() => unavailable.value),
    analyze,
    set,
    markUnavailable,
  }
}
