import type { CalendarFeedInput, CalendarPreferencesInput } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { disconnectCalendarFeed, getMyCalendarFeed, saveCalendarFeed, updateCalendarHours, type CalendarFeedViewDto } from '@/lib/interview-api'
import { calendarErrorKey } from '@/lib/interview-view'
import { loaded } from '@/lib/job-api'

type Busy = 'save' | 'hours' | 'disconnect'

/** The signed-in person's own calendar link: what is connected, and the save, hours change and disconnect calls. */
export const useMyCalendarFeed = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('my-calendar-feed', () => loaded(() => getMyCalendarFeed(request)))
  const busy = ref<Busy | null>(null)
  const actionErrorKey = ref<string | null>(null)
  /** The answer of the last change, so the page shows it without a second read. */
  const latest = ref<CalendarFeedViewDto | null>(null)

  const run = async (kind: Busy, action: () => Promise<CalendarFeedViewDto>, successKey: string): Promise<boolean> => {
    busy.value = kind
    actionErrorKey.value = null
    try {
      latest.value = await action()
      toast.success(t(successKey))
      return true
    } catch (error) {
      actionErrorKey.value = calendarErrorKey(error)
      return false
    } finally {
      busy.value = null
    }
  }

  const disconnected = async (): Promise<CalendarFeedViewDto> => {
    await disconnectCalendarFeed(request)
    return getMyCalendarFeed(request)
  }

  return {
    feed: computed(() => latest.value ?? data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    actionErrorKey: computed(() => actionErrorKey.value),
    busy: computed(() => busy.value),
    refresh: async () => {
      latest.value = null
      await refresh()
    },
    save: (input: CalendarFeedInput) => run('save', () => saveCalendarFeed(request, input), 'calendar.saved.connected'),
    saveHours: (input: CalendarPreferencesInput) => run('hours', () => updateCalendarHours(request, input), 'calendar.saved.hours'),
    disconnect: () => run('disconnect', disconnected, 'calendar.saved.disconnected'),
  }
}
