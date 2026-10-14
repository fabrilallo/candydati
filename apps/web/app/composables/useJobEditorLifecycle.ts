import { toast } from 'vue-sonner'
import type { JobEditorState } from './useJobEditorState'
import { openApplicationsOf } from '@/lib/attention-api'
import { closeJob, createTemplate } from '@/lib/job-api'
import { validateForm } from '@/lib/job-form'

/** Close the job and save it as a template. */
export const useJobEditorLifecycle = ({ t, api, draft, job, busy, errorKey, permissions, setKey, fail }: JobEditorState) => {
  /** Open applications the api reported when it refused the last close (`open_applications:<n>`), or null. */
  const openOnClose = ref<number | null>(null)
  const close = async (): Promise<boolean> => {
    if (!job.value || !permissions.value.close) return false
    busy.value = 'close'
    errorKey.value = null
    openOnClose.value = null
    try {
      job.value = await closeJob(api, job.value.id)
      toast.success(t('job.actions.closed'))
      return true
    } catch (error) {
      openOnClose.value = openApplicationsOf(error)
      return openOnClose.value === null ? fail(error) : false
    } finally {
      busy.value = null
    }
  }

  const saveTemplate = async (name: string): Promise<boolean> => {
    const { content } = validateForm(draft.form.value)
    if (!content) return setKey('job.actions.cannotSave')
    busy.value = 'template'
    errorKey.value = null
    try {
      await createTemplate(api, name, content)
      toast.success(t('job.actions.templateSaved'))
      return true
    } catch (error) {
      return fail(error)
    } finally {
      busy.value = null
    }
  }

  return { openOnClose, close, saveTemplate }
}
