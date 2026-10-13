import { listCandidates } from '@/lib/candidate-api'
import { loaded } from '@/lib/job-api'

/** How many candidates the organization has (one row asked, the total read from the page meta). */
export const useCandidateCount = () => {
  const request = useJobsApi()
  const { data } = useFreshAsyncData('candidate-count', () => loaded(() => listCandidates(request, { query: '', tag: null, talentPool: false, page: 1, limit: 1 })))
  return { count: computed(() => data.value?.data?.meta.total ?? null) }
}
