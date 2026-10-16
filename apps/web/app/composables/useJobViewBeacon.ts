import { browserDoNotTrack, browserSend, sendJobView } from '@/lib/job-view-beacon'

/**
 * Counts one visit of the public ad, after hydration: a visitor whose browser did not run the page's JavaScript, and every
 * crawler that does not, is never counted. Aggregate only; see `lib/job-view-beacon.ts`.
 */
export const useJobViewBeacon = (target: { readonly org: string; readonly job: string }): void => {
  onMounted(() => {
    try {
      sendJobView(target.org, target.job, {
        search: window.location.search,
        referrer: document.referrer,
        host: window.location.host,
        doNotTrack: browserDoNotTrack(),
        send: browserSend,
      })
    } catch (error) {
      // A counter must never break the page.
      console.error('[view] could not count the visit', error instanceof Error ? error.message : error)
    }
  })
}
