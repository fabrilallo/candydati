import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { listApplicationFeedback, requestFeedback } from '@/lib/feedback-api'
import { loaded } from '@/lib/job-api'
import type { FeedbackRequestInput } from '@/lib/feedback-view'

/** Requests and submitted feedback of one application (phase 9), plus the manual "ask for feedback" call. */
export const useApplicationFeedback = (applicationId: () => string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData(`feedback-${applicationId()}`, () => loaded(() => listApplicationFeedback(request, applicationId())), { watch: [applicationId] })
  const busy = ref(false)
  const sendErrorKey = ref<string | null>(null)

  const ask = async (input: FeedbackRequestInput): Promise<boolean> => {
    busy.value = true
    sendErrorKey.value = null
    try {
      await requestFeedback(request, applicationId(), input)
      toast.success(t('feedback.request.sent'))
      await refresh()
      return true
    } catch (error) {
      sendErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      busy.value = false
    }
  }

  return {
    feedback: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    busy: computed(() => busy.value),
    sendErrorKey: computed(() => sendErrorKey.value),
    refresh,
    ask,
  }
}
