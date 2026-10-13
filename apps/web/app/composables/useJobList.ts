import type { JobStatus } from '@tt/domain'
import { JOB_PAGE_SIZE, listJobs, loaded } from '@/lib/job-api'

/**
 * Paginated job list. Status filter and page are plain component state (never the URL): no crawlable
 * query-string space. Changing the filter goes back to page 1.
 */
export const useJobList = () => {
  const status = ref<JobStatus | null>(null)
  const page = ref(1)
  const request = useJobsApi()
  const { data, status: fetchStatus, refresh } = useFreshAsyncData('jobs-list', () => loaded(() => listJobs(request, status.value, page.value, JOB_PAGE_SIZE)), { watch: [status, page] })

  const setStatus = (next: JobStatus | null): void => {
    status.value = next
    page.value = 1
  }
  const goTo = (next: number): void => {
    page.value = Math.max(1, next)
  }

  return {
    status,
    page,
    jobs: computed(() => data.value?.data?.jobs ?? []),
    meta: computed(() => data.value?.data?.meta ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => fetchStatus.value === 'pending'),
    refresh,
    setStatus,
    goTo,
  }
}
