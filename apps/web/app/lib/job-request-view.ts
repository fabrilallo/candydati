import type { JobRequestDto, JobRequestStatus, Role } from '@candydati/domain'
import { roleLabel } from './role-label'
import { formatMoney } from './job-view'
import { can } from './permissions-ui'

export type RequestTone = 'warning' | 'success' | 'destructive' | 'secondary'

const TONES: Readonly<Record<JobRequestStatus, RequestTone>> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'destructive',
  converted: 'secondary',
}

/** Pill of a request: waiting for a decision = warning, approved = success, rejected = destructive, done = spent. */
export const requestStatusTone = (status: JobRequestStatus): RequestTone => TONES[status]

/** Only approvers (owner, admin) decide, and only while the request waits. */
export const canDecide = (role: Role | null, request: Pick<JobRequestDto, 'status'>): boolean => request.status === 'submitted' && can(role, 'job:approve')

/** An approved request becomes an ad for whoever can create ads. */
export const canConvert = (role: Role | null, request: Pick<JobRequestDto, 'status'>): boolean => request.status === 'approved' && can(role, 'job:create')

export type JobRequestAction = 'decide' | 'convert' | 'open_job' | 'wait' | 'none'

/** What the detail page offers: decide, make the ad, open the ad, or only a line saying what is pending. */
export const jobRequestAction = (role: Role | null, request: JobRequestDto): JobRequestAction => {
  if (canDecide(role, request)) return 'decide'
  if (canConvert(role, request)) return 'convert'
  if (request.status === 'converted') return request.jobId ? 'open_job' : 'none'
  return request.status === 'rejected' ? 'none' : 'wait'
}

export const newestFirst = (requests: readonly JobRequestDto[]): readonly JobRequestDto[] => requests.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))

/** `45.000 € - 60.000 €` (gross annual), empty when the request carries no budget. */
export const requestBudget = (request: Pick<JobRequestDto, 'salaryMin' | 'salaryMax' | 'currency'>, language: string): string => {
  const { salaryMin: min, salaryMax: max, currency } = request
  return min === max ? formatMoney(min, currency, language) : `${formatMoney(min, currency, language)} - ${formatMoney(max, currency, language)}`
}

/** `Milano, IT`: the parts of the location that were filled in, empty when none. */
export const locationLine = (location: JobRequestDto['location']): string => [location.city, location.country].filter((part) => part !== undefined && part !== '').join(', ')

/** The text of an optional note, or `fallback` when it was left empty. */
export const noteOr = (note: string, fallback: string): string => (note.trim() === '' ? fallback : note)

export const requestsEmptyKey = (role: Role | null): string => (can(role, 'job:create') ? 'jobRequests.list.emptyCreate' : 'jobRequests.list.emptyReadOnly')

type Tr = (key: string, params?: Record<string, unknown>) => string

/** Pure: the request as lines of "label: value", the context handed to the assistant (only what was filled in). */
export const requestSummary = (request: JobRequestDto, tr: Tr, language: string): string => {
  const rows: readonly (readonly [string, string])[] = [
    ['title', request.title],
    ['role', roleLabel(request.role, request.customRole, tr)],
    ['reason', request.reason],
    ['headcount', String(request.headcount)],
    ['budget', requestBudget(request, language)],
    ['workMode', request.workMode ? tr(`taxonomy.workModes.${request.workMode}`) : ''],
    ['location', locationLine(request.location)],
    ['desiredStart', request.desiredStart ?? ''],
    ['processNotes', request.processNotes],
    ['interviewersNotes', request.interviewersNotes],
  ]
  return rows
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => `- ${tr('jobRequests.assistant.line', { label: tr(`jobRequests.fields.${key}`), value })}`)
    .join('\n')
}
