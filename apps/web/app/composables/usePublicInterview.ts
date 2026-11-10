import { interviewPath } from '@candydati/domain'
import { bookInterviewSlot, cancelInterviewAsCandidate, loadPublicInterview, type PublicInterviewDto } from '@/lib/interview-api'
import { bookingFailure, type BookingFailure } from '@/lib/interview-view'
import type { JobApiRequest } from '@/lib/job-api'

type Busy = 'book' | 'cancel'

interface PageState {
  readonly token: Ref<string>
  readonly view: Ref<PublicInterviewDto>
  /** The page cannot go on (a link no longer valid): shown instead of the invitation. */
  readonly failure: Ref<BookingFailure | null>
  /** What the last action said, under the times. */
  readonly notice: Ref<BookingFailure | null>
  readonly selected: Ref<string | null>
  readonly busy: Ref<Busy | null>
  readonly booked: Ref<boolean>
}

const REFRESHING: readonly BookingFailure[] = ['slotTaken', 'tooLate', 'cancelled', 'changed']

/** Runs an action of the page: a conflict refreshes the times and says why, a link no longer valid ends the page. */
const pageRunner = (state: PageState, reload: () => Promise<void>) => async (kind: Busy, action: () => Promise<void>): Promise<boolean> => {
  state.busy.value = kind
  state.notice.value = null
  try {
    await action()
    return true
  } catch (error) {
    const reason = bookingFailure(error)
    if (reason === 'invalid') state.failure.value = 'invalid'
    else state.notice.value = reason
    if (REFRESHING.includes(reason)) {
      state.selected.value = null
      await reload()
    }
    return false
  } finally {
    state.busy.value = null
  }
}

const bookingActions = (state: PageState, request: JobApiRequest) => {
  const reload = async (): Promise<void> => {
    const load = await loadPublicInterview(request, state.token.value)
    if (load.kind === 'ok') state.view.value = load.data
    else if (load.failure === 'invalid') state.failure.value = 'invalid'
  }
  const run = pageRunner(state, reload)
  const book = async (): Promise<boolean> => {
    const slot = state.selected.value
    if (!slot) return false
    return run('book', async () => {
      const result = await bookInterviewSlot(request, state.token.value, slot)
      state.token.value = result.token
      // The old link no longer works: the address bar must not keep it (nor the `?slot` of the email).
      if (import.meta.client) window.history.replaceState(window.history.state, '', interviewPath(result.token))
      state.view.value = { ...state.view.value, status: 'booked', startsAt: result.startsAt }
      state.selected.value = null
      state.booked.value = true
      await reload()
    })
  }
  const cancel = (): Promise<boolean> =>
    run('cancel', async () => {
      await cancelInterviewAsCandidate(request, state.token.value)
      state.view.value = { ...state.view.value, status: 'cancelled', canChange: false, slots: [] }
      state.booked.value = false
    })
  return { book, cancel, reload }
}

/**
 * The candidate's booking page after it rendered: the time chosen, booking it (only on Confirm), moving or cancelling.
 * Every booking returns a new link: the page goes on with it and the address bar shows it, the old one stops working.
 */
export const usePublicInterview = (initialToken: string, initial: PublicInterviewDto) => {
  const state: PageState = {
    token: ref(initialToken),
    view: ref(initial),
    failure: ref(null),
    notice: ref(null),
    selected: ref(null),
    busy: ref(null),
    booked: ref(false),
  }
  return { ...state, ...bookingActions(state, useJobsApi()) }
}
