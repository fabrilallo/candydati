import { attentionTotals } from '@/lib/attention-api'
import { loaded } from '@/lib/job-api'

/** Late and near answers (the sidebar shows their sum). Only call it when the viewer can read candidates. */
export const useAttentionCount = () => {
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('attention-count', () => loaded(() => attentionTotals(request)), { refetchOnFocus: true })
  const totals = computed(() => data.value?.data ?? null)
  return { totals, count: computed(() => (totals.value ? totals.value.overdue + totals.value.dueSoon : null)), refresh }
}
