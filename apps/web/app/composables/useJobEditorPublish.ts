import { toast } from 'vue-sonner'
import type { JobEditorState } from './useJobEditorState'
import { publishJob } from '@/lib/job-api'
import { snapshotOf, validateForm } from '@/lib/job-form'
import { needsConfirmation } from '@/lib/quality-view'

/** Publish: save if dirty -> analyse -> confirm when below threshold -> publish. */
export const useJobEditorPublish = (state: JobEditorState, save: (options: { navigate: boolean }) => Promise<boolean>) => {
  const { t, api, draft, quality, job, busy, confirmOpen, permissions, fail, goToSaved } = state
  /** Shared across the navigation from `/app/jobs/new` to the saved ad, so the confirmation survives it. */
  const justPublished = useState<string | null>('job-just-published', () => null)
  const publishedOpen = computed(() => job.value !== null && justPublished.value === job.value.id)
  const dismissPublished = (): void => {
    justPublished.value = null
  }

  const finishPublish = async (): Promise<void> => {
    if (!job.value) return
    busy.value = 'publish'
    try {
      const result = await publishJob(api, job.value.id)
      job.value = result.job
      if (result.job.status === 'published') justPublished.value = result.job.id
      if (result.quality) quality.set(result.quality, snapshotOf(draft.form.value))
      toast.success(t('job.publish.published'))
      if (!result.quality) toast.message(t('job.publish.noAnalysis'))
      await goToSaved()
    } catch (error) {
      fail(error)
    } finally {
      busy.value = null
    }
  }

  const publish = async (): Promise<void> => {
    if (!draft.check.value.publishable || !permissions.value.publish) return
    if ((job.value === null || draft.dirty.value) && !(await save({ navigate: false }))) return
    const { content } = validateForm(draft.form.value)
    busy.value = 'publish'
    const assessment = content ? await quality.analyze(content, snapshotOf(draft.form.value)) : null
    busy.value = null
    if (needsConfirmation(assessment)) {
      confirmOpen.value = true
      return
    }
    await finishPublish()
  }

  const confirmPublish = async (): Promise<void> => {
    confirmOpen.value = false
    await finishPublish()
  }
  const cancelPublish = async (): Promise<void> => {
    confirmOpen.value = false
    await goToSaved()
  }

  return { publishedOpen, dismissPublished, publish, confirmPublish, cancelPublish }
}
