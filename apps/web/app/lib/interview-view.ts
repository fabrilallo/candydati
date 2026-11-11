import { CALENDAR_FEED_ERRORS, zonedParts, type InterviewStatus } from '@candydati/domain'
import { ApiFailure } from './api-call'
import { errorKeyOf } from './auth-errors'

/** Pure view logic of interview scheduling: free times by day, the calendar settings, what each failure says. */

const intlLocale = (locale: string): string => (locale === 'it' ? 'it-IT' : 'en-GB')
const pad = (value: number): string => String(value).padStart(2, '0')

export interface SlotView {
  readonly iso: string
  /** HH:MM in the zone. */
  readonly time: string
}

export interface SlotDay {
  /** YYYY-MM-DD in the zone. */
  readonly key: string
  readonly label: string
  readonly slots: readonly SlotView[]
}

const instantsOf = (slots: readonly string[]): readonly Date[] =>
  slots
    .map((iso) => new Date(iso))
    .filter((date) => !Number.isNaN(date.getTime()))
    .toSorted((a, b) => a.getTime() - b.getTime())

/** Pure: the free times grouped by local day of `timeZone`, in time order. */
export const groupSlotsByDay = (slots: readonly string[], timeZone: string, locale: string): readonly SlotDay[] => {
  const label = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', timeZone })
  return instantsOf(slots).reduce<readonly SlotDay[]>((days, date) => {
    const parts = zonedParts(date, timeZone)
    const key = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
    const slot: SlotView = { iso: date.toISOString(), time: `${pad(Math.floor(parts.minutes / 60))}:${pad(parts.minutes % 60)}` }
    const last = days.at(-1)
    if (last?.key === key) return [...days.slice(0, -1), { ...last, slots: [...last.slots, slot] }]
    return [...days, { key, label: label.format(date), slots: [slot] }]
  }, [])
}

/** Pure: the time preselected by the email link (`?slot=`), only when it is still among the free ones. */
export const matchSlot = (raw: unknown, slots: readonly string[]): string | null => {
  if (typeof raw !== 'string') return null
  const wanted = new Date(raw).getTime()
  if (Number.isNaN(wanted)) return null
  return slots.find((slot) => new Date(slot).getTime() === wanted) ?? null
}

/** Pure: a date and time in a zone, for a booked interview. */
export const formatSlot = (iso: string, timeZone: string, locale: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    .format(date)
    .replace(/\s+alle\s+/, ', ')
}

/** The zone of the browser; the fallback where there is none (server render). */
export const browserTimeZone = (fallback: string): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback
  } catch {
    return fallback
  }
}

export type BookingFailure = 'slotTaken' | 'tooLate' | 'cancelled' | 'changed' | 'invalid' | 'rateLimited' | 'unavailable'

const CONFLICTS: Readonly<Record<string, BookingFailure>> = {
  slot_taken: 'slotTaken',
  too_late_to_change: 'tooLate',
  interview_cancelled: 'cancelled',
  interview_changed: 'changed',
}

/** Pure: what the booking page says when loading, booking or cancelling fails. */
export const bookingFailure = (error: unknown): BookingFailure => {
  if (!(error instanceof ApiFailure)) return 'unavailable'
  const { status, message } = error.failure
  if (status === 409) return (message && CONFLICTS[message]) || 'changed'
  if (status === 404 || status === 400) return 'invalid'
  if (status === 429) return 'rateLimited'
  return 'unavailable'
}

const issuesOf = (error: unknown): readonly { readonly path: string; readonly message: string }[] => (error instanceof ApiFailure ? error.failure.issues : [])

/** Pure: why a calendar link or the hours were refused, in plain words. */
export const calendarErrorKey = (error: unknown): string => {
  const issues = issuesOf(error)
  const known = issues.map((issue) => issue.message.replace(/^calendar_/, '')).find((code) => (CALENDAR_FEED_ERRORS as readonly string[]).includes(code))
  if (known) return `calendar.errors.${known}`
  if (issues.some((issue) => issue.path === 'url')) return 'calendar.errors.url'
  if (issues.some((issue) => issue.path.startsWith('workingHours'))) return 'calendar.errors.hours'
  if (issues.some((issue) => issue.path === 'timeZone')) return 'calendar.errors.timeZone'
  return errorKeyOf(error)
}

const PROPOSE_CODES: readonly string[] = ['no_interviewers', 'unknown_stage', 'application_closed']

/** Pure: why an interview could not be proposed. */
export const proposeErrorKey = (error: unknown): string => {
  if (error instanceof ApiFailure && error.failure.status === 409) return 'interviews.errors.open'
  const code = issuesOf(error).map((issue) => issue.message).find((message) => PROPOSE_CODES.includes(message))
  return code ? `interviews.errors.${code}` : errorKeyOf(error)
}

export interface Notice {
  readonly key: string
  readonly tone: 'success' | 'warning'
  readonly params?: Readonly<Record<string, string | number>>
}

/** Pure: what the recruiter reads once the invitation is on its way. */
export const proposeNotices = (result: { readonly freeSlots: number; readonly withoutCalendar: readonly string[]; readonly withoutLink?: boolean }): readonly Notice[] => [
  { key: 'interviews.proposed.sent', tone: 'success' },
  ...(result.withoutLink ? [{ key: 'interviews.proposed.withoutLink', tone: 'warning' as const }] : []),
  ...(result.withoutCalendar.length > 0
    ? [{ key: 'interviews.proposed.withoutCalendar', tone: 'warning' as const, params: { names: result.withoutCalendar.join(', '), count: result.withoutCalendar.length } }]
    : []),
  ...(result.freeSlots === 0 ? [{ key: 'interviews.proposed.noSlots', tone: 'warning' as const }] : []),
]

/** The working hours being edited, with the zone they are in. */
export interface HoursDraft {
  readonly days: readonly number[]
  readonly start: string
  readonly end: string
  readonly timeZone: string
}

/** Pure: the PATCH body of a draft. */
export const preferencesOf = (draft: HoursDraft): { readonly timeZone: string; readonly workingHours: { readonly days: number[]; readonly start: string; readonly end: string } } => ({
  timeZone: draft.timeZone,
  workingHours: { days: [...draft.days], start: draft.start, end: draft.end },
})

const MINUTE = 60_000
/** Pure: how long ago the calendar was last read. */
export const feedAge = (fetchedAt: string | null, now: Date): { readonly key: string; readonly count: number } | null => {
  if (!fetchedAt) return null
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(fetchedAt).getTime()) / MINUTE))
  if (minutes < 1) return { key: 'calendar.status.justNow', count: 0 }
  if (minutes < 60) return { key: 'calendar.status.minutesAgo', count: minutes }
  if (minutes < 48 * 60) return { key: 'calendar.status.hoursAgo', count: Math.floor(minutes / 60) }
  return { key: 'calendar.status.daysAgo', count: Math.floor(minutes / (24 * 60)) }
}

/** A Monday (UTC), to name the weekdays in the locale. */
const MONDAY = Date.UTC(2024, 0, 1)
const DAY = 24 * 60 * MINUTE

/** Pure: ISO weekdays 1 (Monday) to 7 (Sunday) with their short name. */
export const weekdayOptions = (locale: string): readonly { readonly day: number; readonly label: string }[] => {
  const format = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' })
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, label: format.format(new Date(MONDAY + (day - 1) * DAY)) }))
}

const supportedZones = (): readonly string[] => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

/** Pure: the IANA zones the runtime knows, plus the chosen one so the select never loses it. */
export const timeZoneOptions = (chosen: string): readonly string[] => {
  const zones = supportedZones()
  return zones.includes(chosen) ? zones : [chosen, ...zones]
}

/** Pure: the badge colour of an interview state. */
export const interviewStatusTone = (status: InterviewStatus): 'success' | 'warning' | 'secondary' =>
  status === 'booked' ? 'success' : status === 'proposed' ? 'warning' : 'secondary'
