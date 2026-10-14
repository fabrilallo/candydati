import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { sendMessages, unknownFromFailure } from '@/lib/message-api'
import type { ComposerOptions } from './useMessageComposer'

interface Draft {
  readonly ready: Ref<boolean>
  readonly templateId: Ref<string | null>
  readonly subject: Ref<string>
  readonly body: Ref<string>
  /** Variables the api refused: the composer shows them as unknown until the text changes. */
  readonly refused: Ref<readonly string[]>
}

/** Queues the messages of a composed draft. */
export const useMessageSend = (options: ComposerOptions, draft: Draft) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const sending = ref(false)
  const sendErrorKey = ref<string | null>(null)

  /** Queues the messages; returns how many, or null when the api refused (the reason is in `sendErrorKey`). */
  const send = async (): Promise<number | null> => {
    if (!draft.ready.value || sending.value) return null
    sending.value = true
    sendErrorKey.value = null
    try {
      const queued = await sendMessages(request, { applicationIds: options.applicationIds(), templateId: draft.templateId.value, subject: draft.subject.value, body: draft.body.value })
      toast.success(t('messages.composer.queued', { count: queued }, queued))
      return queued
    } catch (error) {
      sendErrorKey.value = errorKeyOf(error)
      draft.refused.value = unknownFromFailure(error)
      return null
    } finally {
      sending.value = false
    }
  }

  return { sending, sendErrorKey, send }
}
