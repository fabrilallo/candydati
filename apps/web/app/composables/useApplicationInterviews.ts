import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { cancelApplicationInterview, listInterviews, proposeInterview, type ProposeForm } from '@/lib/interview-api'
import { proposeErrorKey, proposeNotices, type Notice } from '@/lib/interview-view'
import { loaded } from '@/lib/job-api'

type Busy = 'propose' | 'cancel'

/** `attempt(kind, action, errorRef, keyOf)`: busy while it runs; a failure leaves its key in `errorRef`. */
const busyAttempt = (busy: Ref<Busy | null>) => async (kind: Busy, action: () => Promise<void>, errorRef: Ref<string | null>, keyOf: (error: unknown) => string): Promise<boolean> => {
  busy.value = kind
  errorRef.value = null
  try {
    await action()
    return true
  } catch (error) {
    errorRef.value = keyOf(error)
    return false
  } finally {
    busy.value = null
  }
}

/** The interviews of one application, plus proposing one (the candidate books) and cancelling an open one. */
export const useApplicationInterviews = (applicationId: () => string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`interviews-${applicationId()}`, () => loaded(() => listInterviews(request, applicationId())), { watch: [applicationId] })
  const busy = ref<Busy | null>(null)
  const proposeError = ref<string | null>(null)
  const cancelError = ref<string | null>(null)
  /** What the recruiter reads after the last proposal: sent, and any warning. */
  const notices = ref<readonly Notice[]>([])
  const attempt = busyAttempt(busy)

  const propose = (form: ProposeForm): Promise<boolean> =>
    attempt('propose', async () => {
      notices.value = proposeNotices(await proposeInterview(request, applicationId(), form))
      await refresh()
    }, proposeError, proposeErrorKey)

  const cancel = (interviewId: string): Promise<boolean> =>
    attempt('cancel', async () => {
      await cancelApplicationInterview(request, interviewId)
      toast.success(t('interviews.cancel.done'))
      await refresh()
    }, cancelError, errorKeyOf)

  return {
    interviews: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    proposeError: computed(() => proposeError.value),
    cancelError: computed(() => cancelError.value),
    notices: computed(() => notices.value),
    clearProposeError: () => {
      proposeError.value = null
    },
    refresh,
    propose,
    cancel,
  }
}
