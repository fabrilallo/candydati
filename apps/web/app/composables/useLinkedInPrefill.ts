import { LINKEDIN_RETURN_FRAGMENT, type LinkedInPrefill } from '@candydati/domain'
import { fetchLinkedInEnabled, LINKEDIN_NOTICE_KEYS, takeLinkedInPrefill } from '@/lib/linkedin-prefill'

type NoticeKey = (typeof LINKEDIN_NOTICE_KEYS)[keyof typeof LINKEDIN_NOTICE_KEYS]

/** The browser came back from LinkedIn (the fragment carries no data, only "ask for the prefill"). */
export const cameBackFromLinkedIn = (): boolean => import.meta.client && window.location.hash === `#${LINKEDIN_RETURN_FRAGMENT}`

/** Drops the fragment, so a reload does not ask again for a prefill that was already handed over. */
const forgetReturn = (): void => {
  const url = new URL(window.location.href)
  url.hash = 'apply'
  window.history.replaceState(window.history.state, '', url.toString())
}

/**
 * "Fill in with LinkedIn" on the application form: whether the button shows, and, back from LinkedIn, the fields to
 * fill (once) and the message to show. Nothing is sent by itself: the candidate reviews the form and sends it.
 */
export const useLinkedInPrefill = (apply: (prefill: LinkedInPrefill) => void) => {
  const request = useJobsApi()
  const enabled = ref(false)
  const noticeKey = ref<NoticeKey | null>(null)

  onMounted(async () => {
    const returning = cameBackFromLinkedIn()
    const [isEnabled, result] = await Promise.all([fetchLinkedInEnabled(request), returning ? takeLinkedInPrefill(request) : null])
    enabled.value = isEnabled
    if (returning) forgetReturn()
    if (result === null || result.status === 'none') return
    if (result.status === 'filled') apply(result.prefill)
    noticeKey.value = LINKEDIN_NOTICE_KEYS[result.status]
  })

  return { enabled, noticeKey }
}
