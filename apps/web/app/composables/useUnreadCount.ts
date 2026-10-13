import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { unreadCount } from '@/lib/inbox-api'

/** How often the bell asks for the unread count, and only while the tab is visible. */
export const UNREAD_POLL_MS = 60_000

/**
 * The unread notifications of the signed-in person. Polls every minute while the tab is visible, asks again as soon
 * as the tab comes back, and stops when hidden. A failed poll keeps the last known number.
 */
export const useUnreadCount = () => {
  const request = useJobsApi()
  const count = useState<number | null>('notifications-unread', () => null)
  const visibility = useDocumentVisibility()
  const poll = async (): Promise<void> => {
    try {
      count.value = await unreadCount(request)
    } catch (error) {
      console.error('[notifications] unread count failed', error instanceof Error ? error.message : error)
    }
  }
  const { pause, resume } = useIntervalFn(() => void poll(), UNREAD_POLL_MS, { immediate: false })
  const follow = (state: DocumentVisibilityState): void => {
    if (state === 'visible') {
      void poll()
      resume()
    } else pause()
  }
  onMounted(() => follow(visibility.value))
  watch(visibility, follow)
  onBeforeUnmount(pause)
  return { count: computed(() => count.value), set: (value: number) => (count.value = value), poll }
}
