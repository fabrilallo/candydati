import { toast } from 'vue-sonner'
import type { ComplianceFix } from '@/lib/compliance-fix'
import { complianceView } from '@/lib/compliance-view'
import type { EditorInit } from './useJobEditorState'

/**
 * Everything the editor does against the api, in one place: save (create or update), analyse, publish (save if
 * dirty -> analyse -> confirm when below threshold -> publish), close, save as template. Screens only bind to it.
 * The work is split by concern (`useJobEditorState`, `...Errors`, `...Save`, `...Publish`, `...Lifecycle`).
 */
export const useJobEditor = (init: EditorInit) => {
  const state = useJobEditorState(init)
  const { t, draft, readOnly } = state
  const errors = useJobEditorErrors(state)
  const { save, analyze } = useJobEditorSave(init, state)
  const publishing = useJobEditorPublish(state, save)
  const lifecycle = useJobEditorLifecycle(state)

  /** Compliance findings of the form as it is now (local, instant), with their one-click fixes. */
  const compliance = computed(() => complianceView(draft.form.value, draft.check.value.issues, draft.check.value.warnings))
  const applyFix = (fix: ComplianceFix): void => {
    if (readOnly.value) return
    draft.patch(fix.patch)
    toast.success(t('job.compliance.fixed'))
  }

  useUnsavedGuard(draft.dirty)

  return {
    ...draft,
    job: state.job,
    openCounts: state.openCounts,
    blockedStages: state.blockedStages,
    status: state.status,
    readOnly,
    permissions: state.permissions,
    busy: state.busy,
    errorKey: state.errorKey,
    confirmOpen: state.confirmOpen,
    quality: state.quality,
    ...errors,
    ...publishing,
    ...lifecycle,
    compliance,
    applyFix,
    save,
    analyze,
  }
}
