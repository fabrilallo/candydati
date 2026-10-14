import type { JobEditorState } from './useJobEditorState'
import { visibleIssueErrors } from '@/lib/ad-gaps'

/** Which validation messages the user sees: publish rules appear as controls are left, or when asked. */
export const useJobEditorErrors = ({ draft, attempted }: Pick<JobEditorState, 'draft' | 'attempted'>) => {
  const fieldErrors = computed(() => (attempted.value ? draft.check.value.errors : {}))
  /** Controls the user has left: their publish rules start to show (a fresh draft is not a wall of red). */
  const touched = ref<ReadonlySet<string>>(new Set())
  /** The user asked what is missing: every publish rule shows on its field. */
  const revealed = ref(false)
  const touch = (ids: readonly string[]): void => {
    if (ids.every((id) => touched.value.has(id))) return
    touched.value = new Set([...touched.value, ...ids])
  }
  const reveal = (): void => {
    revealed.value = true
  }
  /** Validation problems win over publish rules on the same field. */
  const errors = computed(() => ({ ...visibleIssueErrors({ issues: draft.check.value.issues, touched: touched.value, attempted: revealed.value }), ...fieldErrors.value }))
  return { fieldErrors, errors, touch, reveal, revealed }
}
