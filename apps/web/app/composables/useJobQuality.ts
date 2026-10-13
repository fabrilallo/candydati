import type { AdQualityAssessment, JobContent } from '@tt/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { analyzeQuality, type JobApiRequest } from '@/lib/job-api'
import { toQualityView } from '@/lib/quality-view'

/**
 * On-demand quality analysis (a model call costs money: never on keystroke). Remembers which form snapshot was
 * analysed so the panel can say the result is out of date.
 */
export const useJobQuality = (api: JobApiRequest, currentSnapshot: () => string) => {
  const assessment = ref<AdQualityAssessment | null>(null)
  const analysedSnapshot = ref<string | null>(null)
  const pending = ref(false)
  const errorKey = ref<string | null>(null)

  const set = (next: AdQualityAssessment, snapshot: string): void => {
    assessment.value = next
    analysedSnapshot.value = snapshot
  }

  /** Resolves with the assessment, or `null` when the analysis could not run (publishing never waits on it). */
  const analyze = async (content: JobContent, snapshot: string): Promise<AdQualityAssessment | null> => {
    pending.value = true
    errorKey.value = null
    try {
      const result = await analyzeQuality(api, content)
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
    analyze,
    set,
  }
}
