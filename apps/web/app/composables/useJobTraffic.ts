import { loaded } from '@/lib/job-api'
import { getJobTraffic } from '@/lib/traffic-api'
import { DEFAULT_TRAFFIC_DAYS, trafficPeriod, type TrafficDays } from '@/lib/traffic-view'

/**
 * Visits and applications per day of one ad over the last 7, 30 or 90 days, for the chart of the Distribution tab. Read
 * again when the period changes; nothing is asked of the api when `enabled` is false (no `report:read`).
 */
export const useJobTraffic = (jobId: string, enabled: () => boolean) => {
  const request = useJobsApi()
  const days = ref<TrafficDays>(DEFAULT_TRAFFIC_DAYS)
  const period = computed(() => trafficPeriod(days.value, new Date()))
  const { data, status, refresh } = useFreshAsyncData(
    () => `job-traffic-${jobId}-${days.value}`,
    () => (enabled() ? loaded(() => getJobTraffic(request, jobId, period.value)) : Promise.resolve(null)),
    { watch: [days] },
  )
  return {
    days,
    period,
    rows: computed(() => data.value?.data?.rows ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
  }
}
