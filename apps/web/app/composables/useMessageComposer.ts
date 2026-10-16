import { BULK_MESSAGE_MAX, EMAIL_TEMPLATE_BODY_MAX, EMAIL_TEMPLATE_SUBJECT_MAX, findUnknownVariables, type EmailTemplateDto } from '@candydati/domain'

export interface ComposerOptions {
  readonly applicationIds: () => readonly string[]
  /** The application whose candidate the preview is rendered for (the first one in bulk). */
  readonly previewFor: () => string | null
}

const isComposable = (subject: string, body: string): boolean =>
  subject.trim() !== '' && subject.length <= EMAIL_TEMPLATE_SUBJECT_MAX && body.trim() !== '' && body.length <= EMAIL_TEMPLATE_BODY_MAX

/**
 * A message being written: template, subject, body, the live preview (debounced, the latest answer wins) and the
 * send. Unknown variables block the send: the local mirror reacts at once, the api's answer confirms. Nothing is sent
 * until the caller asks, after a person confirmed.
 */
export const useMessageComposer = (options: ComposerOptions) => {
  const templateId = ref<string | null>(null)
  const subject = ref('')
  const body = ref('')
  const refused = ref<readonly string[]>([])

  const { preview, previewing, previewErrorKey, fresh, runPreview } = useMessagePreview(options, subject, body, () => {
    refused.value = []
  })
  const unknown = computed(() => [...new Set([...findUnknownVariables(subject.value, body.value), ...(fresh.value?.unknownVariables ?? []), ...refused.value])])
  const tooMany = computed(() => options.applicationIds().length > BULK_MESSAGE_MAX)
  const ready = computed(() => options.applicationIds().length > 0 && !tooMany.value && isComposable(subject.value, body.value) && unknown.value.length === 0)

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

  const { sending, sendErrorKey, send } = useMessageSend(options, { ready, templateId, subject, body, refused })

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
