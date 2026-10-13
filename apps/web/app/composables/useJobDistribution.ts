import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { listJobChannels, syncJobChannels } from '@/lib/distribution-api'
import { loaded } from '@/lib/job-api'

/** The channels of one job and a new sync (`job:publish`). The list is reloaded after a sync: the api answers asynchronously. */
export const useJobDistribution = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useAsyncData(`job-distribution-${jobId}`, () => loaded(() => listJobChannels(request, jobId)))
  const syncing = ref(false)

  const sync = async (): Promise<void> => {
    syncing.value = true
    try {
      await syncJobChannels(request, jobId)
      toast.success(t('distribution.job.syncQueued'))
      await refresh()
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      syncing.value = false
    }
  }

  return { channels: computed(() => data.value?.data ?? null), errorKey: computed(() => data.value?.errorKey ?? null), syncing: computed(() => syncing.value), refresh, sync }
}
