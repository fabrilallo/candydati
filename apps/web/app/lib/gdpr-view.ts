import { candidateCorrectionSchema, RETENTION_WARNING_DAYS, type CandidateCorrection, type ConsentScope, type DataExportStatus, type DataExportDto, type RetentionUpcomingDto } from '@candydati/domain'
import { calendarDays } from './response-countdown'

const parse = (iso: string | null): Date | null => {
  if (iso === null) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export type DaysLeftTone = 'neutral' | 'warning' | 'destructive'

export interface DaysLeft {
  /** Translation key; `count` is the number of days for the plural form. */
  readonly key: string
  readonly count: number
  readonly tone: DaysLeftTone
}

/**
 * Pure: how far the retention expiry is, in calendar days. Within the warning period it is a warning; once passed the
 * daily job erases the data, so it reads as expired.
 */
export const retentionDaysLeft = (iso: string, now: Date, timeZone?: string): DaysLeft | null => {
  const at = parse(iso)
  if (!at) return null
  const days = calendarDays(now, at, timeZone)
  if (days < 0) return { key: 'gdpr.daysLeft.expired', count: -days, tone: 'destructive' }
  const tone: DaysLeftTone = days <= RETENTION_WARNING_DAYS ? 'warning' : 'neutral'
  return days === 0 ? { key: 'gdpr.daysLeft.today', count: 0, tone } : { key: 'gdpr.daysLeft.in', count: days, tone }
}

const normalizeName = (value: string): string => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

/** Pure: the typed text is the person's full name (case and extra spaces do not matter, letters do). */
export const confirmNameMatches = (typed: string, fullName: string): boolean => {
  const expected = normalizeName(fullName)
  return expected !== '' && normalizeName(typed) === expected
}

export interface WithdrawConsequence {
  readonly key: string
  /** The application goes away with the consent. */
  readonly erases: boolean
  /** It was the person's last application: the whole profile goes too. */
  readonly erasesCandidate: boolean
}

/**
 * Pure: what withdrawing a consent does (contract, "Consent withdrawal"). Database candidati: the data stay only for
 * this selection. Selezione: the application is erased, and with the last one the candidate.
 */
export const withdrawConsequence = (scope: ConsentScope, applicationCount: number): WithdrawConsequence => {
  if (scope === 'talent_pool') return { key: 'gdpr.withdraw.consequence.talent_pool', erases: false, erasesCandidate: false }
  const last = applicationCount <= 1
  return { key: last ? 'gdpr.withdraw.consequence.selectionLast' : 'gdpr.withdraw.consequence.selection', erases: true, erasesCandidate: last }
}

export type ExportState = 'preparing' | 'ready' | 'expired' | 'failed'
export type ExportTone = 'secondary' | 'success' | 'outline' | 'destructive'

const BY_STATUS: Readonly<Record<DataExportStatus, ExportState>> = { pending: 'preparing', ready: 'ready', failed: 'failed' }
const TONES: Readonly<Record<ExportState, ExportTone>> = { preparing: 'secondary', ready: 'success', expired: 'outline', failed: 'destructive' }

/** "Scaduto" is not a status of its own: a ready export past `expiresAt` (the retention job deletes it). */
const stateOf = (item: Pick<DataExportDto, 'status' | 'expiresAt'>, now: Date): ExportState => {
  const state = BY_STATUS[item.status]
  if (state !== 'ready') return state
  const expires = parse(item.expiresAt)
  return expires && expires.getTime() <= now.getTime() ? 'expired' : 'ready'
}

/** Pure: an export as "in preparazione", "pronto", "scaduto" or "non riuscito". */
export const exportState = (item: Pick<DataExportDto, 'status' | 'expiresAt'>, now: Date): { readonly state: ExportState; readonly key: string; readonly tone: ExportTone } => {
  const state = stateOf(item, now)
  return { state, key: `dataExport.status.${state}`, tone: TONES[state] }
}

/** Pure: keep polling while at least one export is being prepared. */
export const hasPreparing = (items: readonly Pick<DataExportDto, 'status' | 'expiresAt'>[], now: Date): boolean => items.some((item) => stateOf(item, now) === 'preparing')

export interface RetentionNotice {
  readonly key: string
  readonly params: Readonly<Record<string, string | number>>
  /** For the plural form. */
  readonly count: number
}

/** Pure: "I dati di Marta Verdi scadono tra 12 giorni", with honest fallbacks when the name or the date is missing. */
export const retentionNotice = (input: { readonly candidateName: string | null; readonly expiresAt: string | null }, now: Date, timeZone?: string): RetentionNotice => {
  const prefix = input.candidateName ? 'named' : 'anonymous'
  const nameParams: Readonly<Record<string, string>> = input.candidateName ? { name: input.candidateName } : {}
  const at = parse(input.expiresAt)
  if (!at) return { key: `notifications.retention.${prefix}Soon`, params: nameParams, count: 0 }
  const days = calendarDays(now, at, timeZone)
  if (days <= 0) return { key: `notifications.retention.${prefix}Today`, params: nameParams, count: 0 }
  return { key: `notifications.retention.${prefix}`, params: { ...nameParams, count: days }, count: days }
}

export interface CorrectionForm {
  readonly firstName: string
  readonly lastName: string
  readonly email: string
  readonly phone: string
  readonly linkedinUrl: string
}
export type CorrectionErrors = Partial<Record<keyof CorrectionForm, string>>

export const URL_MAX = 300
/** The domain allows at most 20 characters for a phone number; the field leaves room for spaces typed by hand. */
export const PHONE_MAX = 20

const httpUrl = (value: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const FIELD_ERRORS: Readonly<Record<keyof CorrectionForm, string>> = {
  firstName: 'gdpr.correct.errors.tooLong',
  lastName: 'gdpr.correct.errors.tooLong',
  email: 'gdpr.correct.errors.email',
  phone: 'gdpr.correct.errors.phone',
  linkedinUrl: 'gdpr.correct.errors.url',
}
const isField = (value: unknown): value is keyof CorrectionForm => typeof value === 'string' && value in FIELD_ERRORS

/**
 * Pure: errors as translation keys; empty when the form can be sent. The rules are the domain's
 * (`candidateCorrectionSchema`), plus: names and email are required, LinkedIn must be an http(s) address.
 */
export const validateCorrection = (form: CorrectionForm): CorrectionErrors => {
  const optional = (value: string): string | null => (value.trim() === '' ? null : value.trim())
  const parsed = candidateCorrectionSchema.safeParse({ firstName: form.firstName, lastName: form.lastName, email: form.email.trim(), phone: optional(form.phone), linkedinUrl: optional(form.linkedinUrl) })
  const fromDomain = (parsed.error?.issues ?? []).map((issue) => issue.path[0]).filter(isField)
  const url = form.linkedinUrl.trim()
  const errors: Partial<Record<keyof CorrectionForm, string>> = {
    ...Object.fromEntries(fromDomain.map((field) => [field, FIELD_ERRORS[field]])),
    ...(url !== '' && !httpUrl(url) ? { linkedinUrl: FIELD_ERRORS.linkedinUrl } : {}),
  }
  const required = (['firstName', 'lastName', 'email'] as const).filter((field) => form[field].trim() === '')
  return { ...errors, ...Object.fromEntries(required.map((field) => [field, 'gdpr.correct.errors.required'])) }
}

type Current = { readonly firstName: string; readonly lastName: string; readonly email: string; readonly phone: string | null; readonly linkedinUrl: string | null }

/** Pure: only the fields that changed, trimmed; an emptied optional field becomes null. */
export const correctionChanges = (current: Current, form: CorrectionForm): CandidateCorrection => {
  const optional = (value: string): string | null => (value.trim() === '' ? null : value.trim())
  const next = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: optional(form.phone), linkedinUrl: optional(form.linkedinUrl) }
  return Object.fromEntries(Object.entries(next).filter(([field, value]) => current[field as keyof Current] !== value)) as CandidateCorrection
}

/** Pure: soonest expiry first, in a new list. */
export const sortUpcoming = (items: readonly RetentionUpcomingDto[]): readonly RetentionUpcomingDto[] => items.toSorted((a, b) => a.retentionExpiresAt.localeCompare(b.retentionExpiresAt))
