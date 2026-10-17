import type { SetupProgressDto } from '@candydati/domain'
import { loaded } from '@/lib/job-api'
import { getSetupProgress } from '@/lib/setup-progress-api'

/** The setup checklist state, fetched once per session load; `null` while unknown, so nothing is claimed either way. */
export const useSetupProgress = () => {
  const request = useJobsApi()
  const { data } = useAsyncData('setup-progress', () => loaded(() => getSetupProgress(request)), { dedupe: 'defer' })
  return { progress: computed<SetupProgressDto | null>(() => data.value?.data ?? null) }
}
