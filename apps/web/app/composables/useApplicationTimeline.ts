import { loaded } from '@/lib/job-api'
import { getApplicationTimeline } from '@/lib/timeline-api'

/** The timeline of one application, read again whenever the application or the pipeline it is opened from changes. */
export const useApplicationTimeline = (applicationId: () => string, viaJobId: () => string | null) => {
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData(`timeline-${applicationId()}`, () => loaded(() => getApplicationTimeline(request, applicationId(), viaJobId())), { watch: [applicationId, viaJobId] })
  return {
    items: computed(() => data.value?.data?.items ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
