import { refDebounced } from '@vueuse/core'
import { CANDIDATE_PAGE_SIZE, listCandidates } from '@/lib/candidate-api'
import { normalizeTag } from '@/lib/candidate-view'
import { loaded } from '@/lib/job-api'

export const SEARCH_DEBOUNCE_MS = 300

/**
 * The candidates database: search (name, email, tags, CV text, debounced), talent pool only, one tag, pages.
 * Filters are component state, never the URL: no crawlable query-string space. A new filter goes back to page 1.
 */
export const useCandidateList = () => {
  const request = useJobsApi()
  const query = ref('')
  const debounced = refDebounced(query, SEARCH_DEBOUNCE_MS)
  const talentPool = ref(false)
  const tag = ref<string | null>(null)
  const page = ref(1)
  watch([debounced, talentPool, tag], () => {
    page.value = 1
  })
  const { data, status, refresh } = useFreshAsyncData(
    'candidates-list',
    () => loaded(() => listCandidates(request, { query: debounced.value, tag: tag.value, talentPool: talentPool.value, page: page.value, limit: CANDIDATE_PAGE_SIZE })),
    { watch: [debounced, talentPool, tag, page] },
  )

  const setTag = (input: string | null): void => {
    tag.value = input === null ? null : normalizeTag(input)
  }
  const goTo = (next: number): void => {
    page.value = Math.max(1, next)
  }

  return {
    query,
    talentPool,
    tag,
    page,
    candidates: computed(() => data.value?.data?.candidates ?? []),
    meta: computed(() => data.value?.data?.meta ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    searching: computed(() => query.value !== debounced.value),
    refresh,
    setTag,
    goTo,
  }
}
