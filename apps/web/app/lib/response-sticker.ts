import { displayTimeZone } from './format'
import { responseCountdown, type ResponseInput } from './response-countdown'

/** States the sticker shows: white on track, yellow when due soon, coral when late (docs/DESIGN-SYSTEM.md §3.1). */
export type StickerState = 'on_track' | 'due_soon' | 'overdue'

export interface Sticker {
  readonly state: StickerState
  /** The big line ("5g", "oggi", "!"). */
  readonly figureKey: string
  /** The small line under it ("risposta", "ritardo"). */
  readonly captionKey: string
  /** The full sentence for screen readers, the same wording as the countdown pill. */
  readonly labelKey: string
  /** Days left, or days late, for plural forms. */
  readonly count: number
}

/**
 * Pure: the response promise as a sticker. The words change with the state (days left, "today", "!" with "late"), so
 * colour is never the only signal. Null when there is no promise running (answered, closed, no deadline).
 */
export const responseSticker = (input: ResponseInput, now: Date, timeZone: string = displayTimeZone()): Sticker | null => {
  const countdown = responseCountdown(input, now, timeZone)
  if (countdown === null || countdown.state === 'answered' || countdown.state === 'closed') return null
  const base = { state: countdown.state, labelKey: countdown.key, count: countdown.count }
  if (countdown.state === 'overdue') return { ...base, state: 'overdue', figureKey: 'response.sticker.lateFigure', captionKey: 'response.sticker.late' }
  const figureKey = countdown.count === 0 ? 'response.sticker.today' : 'response.sticker.days'
  return { ...base, state: countdown.state, figureKey, captionKey: 'response.sticker.reply' }
}
