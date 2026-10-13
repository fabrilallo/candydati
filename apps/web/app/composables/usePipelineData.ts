import { getPipeline } from '@/lib/candidate-api'
import { loaded } from '@/lib/job-api'

/**
 * The pipeline of a job as the api returns it, shared by key between the job tabs (count) and the board.
 * Only call it when the viewer can read candidates.
 */
export const usePipelineData = (jobId: string) => {
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData(`pipeline-${jobId}`, () => loaded(() => getPipeline(request, jobId)), { refetchOnFocus: true })
  return {
    pipeline: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
