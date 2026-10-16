import { useDebounceFn } from '@vueuse/core'
import type { TemplatePreviewDto } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { previewMessage } from '@/lib/message-api'
import type { ComposerOptions } from './useMessageComposer'

/** Time without typing before the preview is asked again. */
export const PREVIEW_DELAY_MS = 400

interface Preview {
  readonly source: string
  readonly result: TemplatePreviewDto
}

/** The live preview of a message: debounced, and only the latest answer wins. `onChange` fires on every edit. */
export const useMessagePreview = (options: ComposerOptions, subject: Ref<string>, body: Ref<string>, onChange: () => void) => {
  const request = useJobsApi()
  const preview = ref<Preview | null>(null)
  const previewing = ref(false)
  const previewErrorKey = ref<string | null>(null)
  const source = computed(() => `${options.previewFor() ?? ''}\n${subject.value}\n${body.value}`)
  const latest = { asked: '' }

  const runPreview = async (): Promise<void> => {
    const applicationId = options.previewFor()
    const asked = source.value
    latest.asked = asked
    if (!applicationId || (subject.value.trim() === '' && body.value.trim() === '')) {
      preview.value = null
      return
    }
    previewing.value = true
    try {
      const result = await previewMessage(request, { subject: subject.value, body: body.value, applicationId })
      if (latest.asked === asked) preview.value = { source: asked, result }
      previewErrorKey.value = null
    } catch (error) {
      if (latest.asked === asked) previewErrorKey.value = errorKeyOf(error)
    } finally {
      if (latest.asked === asked) previewing.value = false
    }
  }
  const schedule = useDebounceFn(runPreview, PREVIEW_DELAY_MS)
  watch(source, () => {
    onChange()
    void schedule()
  })

  const fresh = computed(() => (preview.value?.source === source.value ? preview.value.result : null))
  return { source, preview, previewing, previewErrorKey, fresh, runPreview }
}
