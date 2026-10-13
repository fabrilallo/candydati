import type { Ref } from 'vue'
import { listJobs, loaded } from '@/lib/job-api'
import { getReports, reportJobOptions, type ReportJobOption } from '@/lib/report-api'
import type { Period } from '@/lib/report-period'

/** Ads listed in the job filter: one page of 100 is plenty for the organizations this serves. */
const JOB_FILTER_LIMIT = 100

/**
 * The figures of the reports page for a period and an optional job. Refetches when either changes; the previous
 * figures stay on screen (dimmed) meanwhile.
 */
export const useReports = (period: Ref<Period>, jobId: Ref<string | null>) => {
  const request = useJobsApi()
  const { data, status, refresh } = useAsyncData('reports', () => loaded(() => getReports(request, period.value, jobId.value)), { watch: [period, jobId] })
  return {
    report: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}

/** Options of the job filter. A failure leaves only "all ads": the reports still work without it. */
export const useReportJobs = () => {
  const request = useJobsApi()
  const { data } = useAsyncData('report-jobs', () => loaded(async () => reportJobOptions((await listJobs(request, null, 1, JOB_FILTER_LIMIT)).jobs)))
  return computed<readonly ReportJobOption[]>(() => data.value?.data ?? [])
}
