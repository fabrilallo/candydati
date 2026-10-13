import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { getApprovalSetting, listJobRequests, setApprovalSetting } from '@/lib/job-request-api'
import { newestFirst } from '@/lib/job-request-view'

/** The organization's hiring requests, newest first. */
export const useJobRequests = () => {
  const request = useJobsApi()
  const { data, refresh } = useAsyncData('job-requests', () => loaded(() => listJobRequests(request)))
  return {
    items: computed(() => (data.value?.data ? newestFirst(data.value.data) : null)),
    errorKey: computed(() => data.value?.errorKey ?? null),
    refresh,
  }
}

/** Whether ads need approval before publishing (owner and admin read and change it). */
export const useApprovalSetting = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data } = useAsyncData('approval-setting', () => loaded(() => getApprovalSetting(request)))
  const override = ref<boolean | null>(null)
  const saving = ref(false)
  const value = computed(() => override.value ?? data.value?.data ?? null)

  const change = async (next: boolean): Promise<void> => {
    saving.value = true
    try {
      override.value = await setApprovalSetting(request, next)
      toast.success(t('jobRequests.settings.saved'))
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      saving.value = false
    }
  }
  return { value, saving: computed(() => saving.value), errorKey: computed(() => data.value?.errorKey ?? null), change }
}
