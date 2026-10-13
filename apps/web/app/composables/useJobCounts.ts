import { loaded } from '@/lib/job-api'
import { loadJobCounts } from '@/lib/job-counts'

/** Job totals per status for the overview. Only call it when the viewer can read jobs. */
export const useJobCounts = () => {
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData('job-counts', () => loaded(() => loadJobCounts(request)))
  return {
    counts: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
