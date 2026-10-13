import { toast } from 'vue-sonner'
import type { JobForm } from '@/lib/job-form'
import { applyJobProposal } from '@/lib/job-proposal'

interface EditorTarget {
  readonly form: Ref<JobForm>
  readonly patch: (changes: Partial<JobForm>) => void
  readonly readOnly: Readonly<Ref<boolean>>
}

/**
 * The job editor accepts the assistant's proposals while it can be edited: a proposal fills the form (what the
 * proposal leaves empty stays), nothing is saved. A proposal made elsewhere ("Crea una bozza") waits for the editor.
 */
export const useAssistantJobBridge = (target: EditorTarget): void => {
  const { t } = useI18n()
  const assistant = useAssistant()
  let detach: (() => void) | null = null
  const sync = (readOnly: boolean): void => {
    if (!readOnly && !detach) detach = assistant.attachEditor()
    if (readOnly && detach) {
      detach()
      detach = null
    }
  }
  const take = (): void => {
    if (target.readOnly.value || !assistant.pendingProposal.value) return
    const content = assistant.takeProposal()
    if (!content) return
    target.patch(applyJobProposal(target.form.value, content))
    toast.success(t('assistant.draftJob.applied'))
  }
  onMounted(() => {
    watch(target.readOnly, sync, { immediate: true })
    watch(assistant.pendingProposal, take, { immediate: true })
  })
  onBeforeUnmount(() => sync(true))
}

/** The candidate open on screen (page or side panel), so the assistant knows which application "questa" means. */
export const useAssistantFocus = (candidateId: () => string, applicationId: () => string | null): void => {
  const assistant = useAssistant()
  watch(
    [candidateId, applicationId],
    ([candidate, application]) => assistant.setFocus({ candidateId: candidate, applicationId: application }),
    { immediate: true },
  )
  onBeforeUnmount(() => assistant.clearFocus(candidateId()))
}
