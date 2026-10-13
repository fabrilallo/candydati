import type { Role } from '@tt/domain'
import { formatMoney } from './job-view'
import { can } from './permissions-ui'
import { canPhase9, type JobRequestDto, type JobRequestStatus } from './phase9-contract'

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
export const canDecide = (role: Role | null, request: Pick<JobRequestDto, 'status'>): boolean => request.status === 'submitted' && canPhase9(role, 'job:approve')

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
  if (min !== null && max !== null) return min === max ? formatMoney(min, currency, language) : `${formatMoney(min, currency, language)} - ${formatMoney(max, currency, language)}`
  const only = min ?? max
  return only === null ? '' : formatMoney(only, currency, language)
}

export const requestsEmptyKey = (role: Role | null): string => (can(role, 'job:create') ? 'jobRequests.list.emptyCreate' : 'jobRequests.list.emptyReadOnly')

type Tr = (key: string, params?: Record<string, unknown>) => string

/** Pure: the request as lines of "label: value", the context handed to the assistant (only what was filled in). */
export const requestSummary = (request: JobRequestDto, tr: Tr, language: string): string => {
  const rows: readonly (readonly [string, string])[] = [
    ['title', request.title],
    ['role', request.role ? tr(`taxonomy.roles.${request.role}`) : ''],
    ['reason', request.reason],
    ['headcount', String(request.headcount)],
    ['budget', requestBudget(request, language)],
    ['workMode', request.workMode ? tr(`taxonomy.workModes.${request.workMode}`) : ''],
    ['location', request.location ?? ''],
    ['desiredStart', request.desiredStart ?? ''],
    ['processNotes', request.processNotes ?? ''],
    ['interviewersNotes', request.interviewersNotes ?? ''],
  ]
  return rows
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => `- ${tr('jobRequests.assistant.line', { label: tr(`jobRequests.fields.${key}`), value })}`)
    .join('\n')
}
