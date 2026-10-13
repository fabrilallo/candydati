import { toast } from 'vue-sonner'
import { getJobApproval, requestJobApproval } from '@/lib/approval-view'
import { errorKeyOf } from '@/lib/auth-errors'
import { attempt } from '@/lib/load-result'

/** Approval of one ad (Phase 9): whether the organization asks for it, the approval it has, and asking for one. */
export const useJobApproval = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useAsyncData(`job-approval-${jobId}`, () => attempt(() => getJobApproval(request, jobId)))
  const asking = ref(false)
  const ask = async (reason: string): Promise<boolean> => {
    asking.value = true
    try {
      await requestJobApproval(request, jobId, reason)
      toast.success(t('job.approval.asked'))
      return true
    } catch (error) {
      toast.error(t('job.approval.askFailed'), { description: t(errorKeyOf(error)) })
      return false
    } finally {
      asking.value = false
    }
  }
  return {
    status: computed(() => data.value?.data ?? null),
    asking: computed(() => asking.value),
    ask,
    refresh,
  }
}
