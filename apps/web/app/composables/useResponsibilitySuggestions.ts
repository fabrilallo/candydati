import { errorKeyOf } from '@/lib/auth-errors'
import { suggestResponsibilities, type JobApiRequest, type ResponsibilityRequest } from '@/lib/job-api'

/** On-demand proposals (a model call costs money: only when asked). Nothing here touches the form. */
export const useResponsibilitySuggestions = (api: JobApiRequest) => {
  const suggestions = ref<readonly string[]>([])
  const pending = ref(false)
  const errorKey = ref<string | null>(null)
  /** `null` until asked; then what the server said. */
  const outcome = ref<'proposed' | 'unavailable' | 'failed' | null>(null)

  const request = async (input: ResponsibilityRequest): Promise<void> => {
    pending.value = true
    errorKey.value = null
    try {
      const result = await suggestResponsibilities(api, input)
      outcome.value = result.status
      suggestions.value = result.status === 'proposed' ? result.responsibilities : []
    } catch (error) {
      outcome.value = null
      suggestions.value = []
      errorKey.value = errorKeyOf(error)
    } finally {
      pending.value = false
    }
  }
  const take = (lines: readonly string[]): void => {
    suggestions.value = suggestions.value.filter((line) => !lines.includes(line))
  }
  const dismiss = (): void => {
    suggestions.value = []
    outcome.value = null
    errorKey.value = null
  }
  return { suggestions, pending, errorKey, outcome, request, take, dismiss }
}
