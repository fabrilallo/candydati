import { loaded } from '@/lib/job-api'
import { getReports } from '@/lib/report-api'
import { presetPeriod } from '@/lib/report-period'

/**
 * Visits, applications and conversion per source and campaign of one ad, the last 90 days: read once for the
 * Distribution tab, where the sources panel and the saved tracked links both show them. Nothing is asked of the api
 * when `enabled` is false (no `report:read`).
 */
export const useJobSources = (jobId: string, enabled: () => boolean) => {
  const request = useJobsApi()
  const period = presetPeriod('last90', new Date())
  const { data, status, refresh } = useFreshAsyncData(`job-sources-${jobId}`, () => (enabled() ? loaded(() => getReports(request, period, jobId)) : Promise.resolve(null)))
  return {
    report: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
