import { useDebounceFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { previewMessage, sendMessages, unknownFromFailure } from '@/lib/message-api'
import type { EmailTemplateDto, TemplatePreviewDto } from '@/lib/message-schemas'
import { BULK_MESSAGE_MAX, EMAIL_TEMPLATE_BODY_MAX, EMAIL_TEMPLATE_SUBJECT_MAX, findUnknownVariables } from '@tt/domain'

/** Time without typing before the preview is asked again. */
export const PREVIEW_DELAY_MS = 400

interface ComposerOptions {
  readonly applicationIds: () => readonly string[]
  /** The application whose candidate the preview is rendered for (the first one in bulk). */
  readonly previewFor: () => string | null
}

interface Preview {
  readonly source: string
  readonly result: TemplatePreviewDto
}

/**
 * A message being written: template, subject, body, the live preview (debounced, the latest answer wins) and the
 * send. Unknown variables block the send: the local mirror reacts at once, the api's answer confirms. Nothing is sent
 * until the caller asks, after a person confirmed.
 */
export const useMessageComposer = (options: ComposerOptions) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const templateId = ref<string | null>(null)
  const subject = ref('')
  const body = ref('')
  const preview = ref<Preview | null>(null)
  const previewing = ref(false)
  const previewErrorKey = ref<string | null>(null)
  const sending = ref(false)
  const sendErrorKey = ref<string | null>(null)
  const refused = ref<readonly string[]>([])
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
    refused.value = []
    void schedule()
  })

  const fresh = computed(() => (preview.value?.source === source.value ? preview.value.result : null))
  const unknown = computed(() => [...new Set([...findUnknownVariables(subject.value, body.value), ...(fresh.value?.unknownVariables ?? []), ...refused.value])])
  const tooMany = computed(() => options.applicationIds().length > BULK_MESSAGE_MAX)
  const ready = computed(
    () =>
      options.applicationIds().length > 0 &&
      !tooMany.value &&
      subject.value.trim() !== '' &&
      subject.value.length <= EMAIL_TEMPLATE_SUBJECT_MAX &&
      body.value.trim() !== '' &&
      body.value.length <= EMAIL_TEMPLATE_BODY_MAX &&
      unknown.value.length === 0,
  )

  const applyTemplate = (template: EmailTemplateDto | null): void => {
    templateId.value = template?.id ?? null
    if (template) {
      subject.value = template.subject
      body.value = template.body
    }
  }

  const reset = (): void => {
    templateId.value = null
    subject.value = ''
    body.value = ''
    sendErrorKey.value = null
  }

  /** Queues the messages; returns how many, or null when the api refused (the reason is in `sendErrorKey`). */
  const send = async (): Promise<number | null> => {
    if (!ready.value || sending.value) return null
    sending.value = true
    sendErrorKey.value = null
    try {
      const queued = await sendMessages(request, { applicationIds: options.applicationIds(), templateId: templateId.value, subject: subject.value, body: body.value })
      toast.success(t('messages.composer.queued', { count: queued }, queued))
      return queued
    } catch (error) {
      sendErrorKey.value = errorKeyOf(error)
      refused.value = unknownFromFailure(error)
      return null
    } finally {
      sending.value = false
    }
  }

  return {
    templateId: computed(() => templateId.value),
    subject,
    body,
    preview: computed(() => preview.value?.result ?? null),
    stale: computed(() => preview.value !== null && fresh.value === null),
    previewing: computed(() => previewing.value),
    previewErrorKey: computed(() => previewErrorKey.value),
    unknown,
    tooMany,
    ready,
    sending: computed(() => sending.value),
    sendErrorKey: computed(() => sendErrorKey.value),
    applyTemplate,
    reset,
    send,
    previewNow: runPreview,
  }
}
