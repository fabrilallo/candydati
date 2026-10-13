import { getProcessingRecord } from '@/lib/gdpr-api'
import { loaded } from '@/lib/job-api'

/** The organization's data that fill the registro dei trattamenti. */
export const useProcessingRecord = () => {
  const request = useJobsApi()
  const { data, refresh } = useAsyncData('privacy-processing-record', () => loaded(() => getProcessingRecord(request)))
  return { record: computed(() => data.value?.data ?? null), errorKey: computed(() => data.value?.errorKey ?? null), refresh }
}
