import { JOB_ROLES } from '@tt/domain'
import type { JobRequestInput } from './phase9-contract'

/** Form state: every field is a string until the form is turned into the wire input. Updates are `{ ...form, ...patch }`. */
export interface JobRequestForm {
  readonly title: string
  readonly role: string
  readonly reason: string
  readonly headcount: string
  readonly salaryMin: string
  readonly salaryMax: string
  readonly currency: string
  readonly workMode: string
  readonly location: string
  readonly desiredStart: string
  readonly processNotes: string
  readonly interviewersNotes: string
}

export type RequestFormErrors = Partial<Record<keyof JobRequestForm, string>>

export const HEADCOUNT_MAX = 100
const DATE = /^\d{4}-\d{2}-\d{2}$/
const err = (field: string): string => `jobRequests.errors.${field}`

export const emptyRequestForm = (): JobRequestForm => ({
  title: '',
  role: '',
  reason: '',
  headcount: '1',
  salaryMin: '',
  salaryMax: '',
  currency: 'EUR',
  workMode: '',
  location: '',
  desiredStart: '',
  processNotes: '',
  interviewersNotes: '',
})

/** The job editor links here with `?title=` to ask approval for a draft: only a plain string is taken. */
export const requestFormFromTitle = (title: unknown): JobRequestForm => ({ ...emptyRequestForm(), title: typeof title === 'string' ? title.trim() : '' })

const positiveInt = (raw: string): number | null => (/^\d+$/.test(raw.trim()) && Number(raw) > 0 ? Number(raw) : null)

/** Pure: translation key of the first problem per field, empty when the form can be sent. */
export const validateRequestForm = (form: JobRequestForm): RequestFormErrors => {
  const min = positiveInt(form.salaryMin)
  const max = positiveInt(form.salaryMax)
  const headcount = positiveInt(form.headcount)
  const checks: readonly (readonly [keyof JobRequestForm, boolean, string])[] = [
    ['title', form.title.trim() === '', err('title')],
    ['role', !(JOB_ROLES as readonly string[]).includes(form.role), err('role')],
    ['reason', form.reason.trim() === '', err('reason')],
    ['headcount', headcount === null || headcount > HEADCOUNT_MAX, err('headcount')],
    ['salaryMin', min === null, err('salaryMin')],
    ['salaryMax', max === null, err('salaryMax')],
    ['salaryMax', min !== null && max !== null && max < min, err('salaryOrder')],
    ['desiredStart', form.desiredStart !== '' && !DATE.test(form.desiredStart), err('desiredStart')],
  ]
  return checks.reduce<RequestFormErrors>((acc, [field, failed, key]) => (failed && !(field in acc) ? { ...acc, [field]: key } : acc), {})
}

const optional = (key: string, value: string): Record<string, string> => (value.trim() === '' ? {} : { [key]: value.trim() })

/** Pure: the body of `POST /job-requests`. Call only when `validateRequestForm` returned no errors. */
export const toRequestInput = (form: JobRequestForm): JobRequestInput => ({
  title: form.title.trim(),
  role: form.role,
  reason: form.reason.trim(),
  headcount: Number(form.headcount),
  salaryMin: Number(form.salaryMin),
  salaryMax: Number(form.salaryMax),
  currency: form.currency,
  ...optional('workMode', form.workMode),
  ...(form.location.trim() === '' ? {} : { location: { city: form.location.trim() } }),
  ...optional('desiredStart', form.desiredStart),
  ...optional('processNotes', form.processNotes),
  ...optional('interviewersNotes', form.interviewersNotes),
})
