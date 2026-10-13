import { getRetentionOverview } from '@/lib/gdpr-api'
import { loaded } from '@/lib/job-api'
import { getActivePrivacyNotice } from '@/lib/privacy-api'

/**
 * Upcoming expiries and the last runs of the automatic deletion (owner and admin), with the retention periods of
 * the active notice to explain them (null while no notice is published).
 */
export const useRetentionOverview = () => {
  const request = useJobsApi()
  const load = async () => {
    const [overview, notice] = await Promise.all([getRetentionOverview(request), getActivePrivacyNotice(request)])
    return { overview, retentionDays: notice?.retentionDays ?? null }
  }
  const { data, refresh } = useAsyncData('privacy-retention', () => loaded(load))
  return { state: computed(() => data.value?.data ?? null), errorKey: computed(() => data.value?.errorKey ?? null), refresh }
}
