import type { CalendarConnectionStatusDto, CalendarPreferencesInput } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { disconnectMyGoogleCalendar, getMyCalendarConnection } from '@/lib/calendar-connection-api'
import { updateCalendarHours } from '@/lib/interview-api'
import { calendarErrorKey } from '@/lib/interview-view'
import { loaded } from '@/lib/job-api'

/**
 * The signed-in person's Google Calendar connection: whether the instance offers it, who is connected, and the working
 * hours (shared with the iCal link). The state is shared by every panel of the page.
 */
export const useMyCalendarConnection = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('my-calendar-connection', () => loaded(() => getMyCalendarConnection(request)))
  const busy = useState<'disconnect' | 'hours' | null>('my-calendar-connection-busy', () => null)
  const actionErrorKey = useState<string | null>('my-calendar-connection-error', () => null)
  const latest = useState<CalendarConnectionStatusDto | null>('my-calendar-connection-latest', () => null)

  const disconnect = async (): Promise<boolean> => {
    busy.value = 'disconnect'
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
      busy.value = null
    }
  }

  const saveHours = async (input: CalendarPreferencesInput): Promise<boolean> => {
    busy.value = 'hours'
    actionErrorKey.value = null
    try {
      await updateCalendarHours(request, input)
      latest.value = await getMyCalendarConnection(request)
      toast.success(t('googleCalendar.hoursSaved'))
      return true
    } catch (error) {
      actionErrorKey.value = calendarErrorKey(error)
      return false
    } finally {
      busy.value = null
    }
  }

  return {
    status: computed(() => latest.value ?? data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    actionErrorKey: computed(() => actionErrorKey.value),
    busy: computed(() => busy.value),
    refresh: async () => {
      latest.value = null
      await refresh()
    },
    disconnect,
    saveHours,
  }
}
