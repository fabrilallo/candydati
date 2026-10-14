import { toast } from 'vue-sonner'
import type { EditorInit, JobEditorState } from './useJobEditorState'
import { createJob, updateJob } from '@/lib/job-api'
import { adoptStageIds, snapshotOf, validateForm } from '@/lib/job-form'

/** Save (create or update) and analyse. */
export const useJobEditorSave = (init: EditorInit, state: JobEditorState) => {
  const { t, api, draft, quality, job, busy, errorKey, attempted, blockedStages, counts, setKey, fail, goToSaved } = state

  const save = async (options: { navigate: boolean } = { navigate: true }): Promise<boolean> => {
    attempted.value = true
    errorKey.value = null
    blockedStages.value = new Set()
    const sent = draft.form.value
    const { content } = validateForm(sent)
    if (!content) return setKey('job.actions.cannotSave')
    busy.value = 'save'
    try {
      const current = job.value
      const created = current === null
      job.value = created ? await createJob(api, content, init.template?.id) : await updateJob(api, current.id, content)
      const adopted = adoptStageIds(sent, job.value.content)
      // The server gave ids to the new stages: the form keeps them, unless the stages were edited meanwhile.
      if (JSON.stringify(draft.form.value.process) === JSON.stringify(sent.process)) draft.patch({ process: adopted.process })
      draft.markSaved(adopted)
      void counts?.refresh()
      toast.success(t(created ? 'job.actions.created' : 'job.actions.saved'))
      if (options.navigate) await goToSaved()
      return true
    } catch (error) {
      return fail(error)
    } finally {
      busy.value = null
    }
  }

  const analyze = async (): Promise<void> => {
    const { content } = validateForm(draft.form.value)
    attempted.value = true
    if (!content) {
      setKey('job.quality.needsTitle')
      return
    }
    errorKey.value = null
    await quality.analyze(content, snapshotOf(draft.form.value))
  }

  return { save, analyze }
}
