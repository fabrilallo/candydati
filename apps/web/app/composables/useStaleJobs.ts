import type { Ref } from 'vue'
import { loaded } from '@/lib/job-api'
import { listStaleJobs } from '@/lib/stale-jobs-api'

/**
 * The stale ads (published, idle for `STALE_JOB_DAYS` days). One key for every screen, so the attention tab and the
 * jobs list share a single request per page load. Asks nothing while `enabled` is false (no permission to read jobs).
 */
export const useStaleJobs = (enabled: Readonly<Ref<boolean>>) => {
  const request = useJobsApi()
  const { data, status, refresh } = useAsyncData('stale-jobs', () => (enabled.value ? loaded(() => listStaleJobs(request)) : Promise.resolve(null)), {
    watch: [enabled],
  })
  return {
    jobs: computed(() => data.value?.data ?? []),
    count: computed(() => (data.value?.data ? data.value.data.length : null)),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
