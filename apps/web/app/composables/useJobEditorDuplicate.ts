import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { contentToForm } from '@/lib/job-form'
import { fieldIdOf } from '@/lib/job-issues'
import { duplicationNotice, requestStageDuplicate } from '@/lib/stage-duplication'
import type { JobEditorState } from './useJobEditorState'

/**
 * Duplicating a saved stage: the api copies the saved version with what is tied to it, so the form must have no unsaved
 * changes (the row says so). The editor then shows the saved job, `afterCopy` reloads the stage configuration it shows
 * (interviewers, criteria), focus moves to the title of the copy and a toast says what came along.
 */
export const useJobEditorDuplicate = (state: JobEditorState) => {
  const { t, api, draft, job, busy, counts } = state

  const focusTitle = async (stageId: string): Promise<void> => {
    await nextTick()
    const index = draft.form.value.process.findIndex((stage) => stage.id === stageId)
    if (index >= 0) document.getElementById(`${fieldIdOf('process')}-${index}-title`)?.focus()
  }

  const duplicateStage = async (index: number, afterCopy: () => void = () => undefined): Promise<void> => {
    const current = job.value
    const stage = draft.form.value.process[index]
    if (!current || !stage || stage.id === '' || draft.dirty.value || busy.value !== null) return
    busy.value = 'duplicate'
    try {
      const result = await requestStageDuplicate(api, current.id, stage.id)
      job.value = result.job
      const form = contentToForm(result.job.content)
      draft.patch(form)
      draft.markSaved(form)
      void counts?.refresh()
      afterCopy()
      const notice = duplicationNotice(result, t)
      toast.success(notice.title, { description: notice.description })
      await focusTitle(result.stageId)
    } catch (error) {
      toast.error(t('job.editor.process.duplicateFailed'), { description: t(errorKeyOf(error)) })
    } finally {
      busy.value = null
    }
  }

  return { duplicateStage }
}
