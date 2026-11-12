import type { CalendarConnectionStatusDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { disconnectMyGoogleCalendar, getMyCalendarConnection } from '@/lib/calendar-connection-api'
import { loaded } from '@/lib/job-api'

/** The signed-in person's Google Calendar connection: whether the instance offers it, and who is connected. */
export const useMyCalendarConnection = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('my-calendar-connection', () => loaded(() => getMyCalendarConnection(request)))
  const busy = ref(false)
  const actionErrorKey = ref<string | null>(null)
  const latest = ref<CalendarConnectionStatusDto | null>(null)

  const disconnect = async (): Promise<boolean> => {
    busy.value = true
    actionErrorKey.value = null
    try {
      await disconnectMyGoogleCalendar(request)
      latest.value = { available: (latest.value ?? data.value?.data)?.available ?? true, connection: null }
      toast.success(t('googleCalendar.disconnected'))
      return true
    } catch (error) {
      actionErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      busy.value = false
    }
  }

  return {
    status: computed(() => latest.value ?? data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    actionErrorKey: computed(() => actionErrorKey.value),
    busy: computed(() => busy.value),
    refresh,
    disconnect,
  }
}
