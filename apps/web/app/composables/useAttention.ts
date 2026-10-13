import type { Ref } from 'vue'
import { listAttention, type AttentionState } from '@/lib/attention-api'
import { loaded } from '@/lib/job-api'

/** One page of the "Da gestire" list, for the chosen state; refetches when the state or the page change. */
export const useAttention = (state: Ref<AttentionState>, page: Ref<number>) => {
  const request = useJobsApi()
  const { data, status, refresh } = useFreshAsyncData(() => `attention-${state.value}-${page.value}`, () => loaded(() => listAttention(request, state.value, page.value)), { watch: [state, page], refetchOnFocus: true })
  return {
    page: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
