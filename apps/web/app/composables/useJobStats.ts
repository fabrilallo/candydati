import { getJobStats, loaded } from '@/lib/job-api'

/**
 * Aggregates of the organization's ads (overview charts, navigation counts). One request shared by key between the
 * layout and the page. Only call it when the viewer can read jobs.
 */
export const useJobStats = () => {
  const request = useJobsApi()
  const { data, status, refresh } = useAsyncData('job-stats', () => loaded(() => getJobStats(request)))
  return {
    stats: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
