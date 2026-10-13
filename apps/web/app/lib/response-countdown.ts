import { DUE_SOON_HOURS, type Outcome, type ResponseState } from '@tt/domain'

/** What the countdown needs of an application (a board card or an application of the candidate detail). */
export interface ResponseInput {
  readonly responseDueAt: string | null
  readonly respondedAt: string | null
  readonly responseState: ResponseState | null
  readonly outcome: Outcome | null
}

/** docs/DESIGN.md: neutral on track, warning when near, destructive when late; "answered" stays quiet. */
export type CountdownTone = 'neutral' | 'warning' | 'destructive' | 'quiet'

export interface Countdown {
  readonly state: ResponseState
  readonly tone: CountdownTone
  /** Translation key; `count` is the number of days for plural forms. */
  readonly key: string
  readonly count: number
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

const dayNumber = (date: Date, timeZone?: string): number => {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).formatToParts(date)
  const part = (type: string): number => Number(parts.find((item) => item.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day')) / DAY_MS
}

/** Pure: calendar days from `from` to `to` in a time zone (the runtime one when omitted). Negative backwards. */
export const calendarDays = (from: Date, to: Date, timeZone?: string): number => dayNumber(to, timeZone) - dayNumber(from, timeZone)

const parse = (iso: string | null): Date | null => {
  if (iso === null) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Pure: the state of the response promise now. `answered` and `closed` come from the api (or a decision); the others
 * are derived from the due date, so a page left open keeps counting down without asking the api again.
 */
export const effectiveResponseState = (input: ResponseInput, now: Date): ResponseState | null => {
  if (input.outcome !== null || input.responseState === 'closed') return 'closed'
  if (input.responseState === 'answered') return 'answered'
  const due = parse(input.responseDueAt)
  if (!due) return input.respondedAt ? 'answered' : null
  const left = due.getTime() - now.getTime()
  if (left < 0) return 'overdue'
  return left <= DUE_SOON_HOURS * HOUR_MS ? 'due_soon' : 'on_track'
}

const TONES: Readonly<Record<'on_track' | 'due_soon' | 'overdue', CountdownTone>> = { on_track: 'neutral', due_soon: 'warning', overdue: 'destructive' }

/**
 * Pure: the wording of the countdown pill. Days are calendar days ("Scade oggi" means today on the calendar), so
 * the pill never says "entro 0 giorni". Null when there is nothing to show (closed, or no deadline known).
 */
export const responseCountdown = (input: ResponseInput, now: Date, timeZone?: string): Countdown | null => {
  const state = effectiveResponseState(input, now)
  if (state === null || state === 'closed') return null
  if (state === 'answered') return { state, tone: 'quiet', key: 'response.answered', count: 0 }
  const due = parse(input.responseDueAt) as Date
  const tone = TONES[state]
  if (state === 'overdue') {
    const late = calendarDays(due, now, timeZone)
    return { state, tone, key: late === 0 ? 'response.overdueToday' : 'response.overdue', count: late }
  }
  const left = calendarDays(now, due, timeZone)
  return { state, tone, key: left === 0 ? 'response.dueToday' : 'response.dueIn', count: left }
}
