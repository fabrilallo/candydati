import { listCandidates } from '@/lib/candidate-api'
import { loaded } from '@/lib/job-api'

/**
 * How many candidates the organization has (one row asked, the total read from the page meta). The sidebar holds it for
 * the whole session while people apply from the public pages, so it refetches on focus and on every move to another
 * page.
 */
export const useCandidateCount = () => {
  const request = useJobsApi()
  const route = useRoute()
  const { data, refresh } = useFreshAsyncData('candidate-count', () => loaded(() => listCandidates(request, { query: '', tag: null, talentPool: false, page: 1, limit: 1 })), {
    refetchOnFocus: true,
  })
  watch(() => route.path, () => void refresh())
  return { count: computed(() => data.value?.data?.meta.total ?? null) }
}
