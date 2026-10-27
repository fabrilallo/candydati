import { CUSTOM_ROLE, CUSTOM_ROLE_MAX, DEFAULT_LOCALE, HEADCOUNT_MAX, JOB_ROLES, SUPPORTED_LOCALES, type JobRequestInput, type JobRoleChoice, type Locale } from '@candydati/domain'

/** Form state: every field is a string until the form is turned into the wire input. Updates are `{ ...form, ...patch }`. */
export interface JobRequestForm {
  readonly title: string
  readonly role: string
  readonly customRole: string
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

const DATE = /^\d{4}-\d{2}-\d{2}$/
const err = (field: string): string => `jobRequests.errors.${field}`

export const emptyRequestForm = (): JobRequestForm => ({
  title: '',
  role: '',
  customRole: '',
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
    ['role', form.role !== CUSTOM_ROLE && !(JOB_ROLES as readonly string[]).includes(form.role), err('role')],
    ['customRole', form.role === CUSTOM_ROLE && (form.customRole.trim() === '' || form.customRole.trim().length > CUSTOM_ROLE_MAX), err('customRole')],
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

/** The language the drafts of the request are written in: the language of the screen when the platform supports it. */
export const requestLanguage = (uiLocale: string): Locale => SUPPORTED_LOCALES.find((candidate) => candidate === uiLocale) ?? DEFAULT_LOCALE

/** Pure: the body of `POST /job-requests`. Call only when `validateRequestForm` returned no errors. */
export const toRequestInput = (form: JobRequestForm, language: Locale): JobRequestInput => ({
  title: form.title.trim(),
  role: form.role as JobRoleChoice,
  ...(form.role === CUSTOM_ROLE ? { customRole: form.customRole.trim() } : {}),
  reason: form.reason.trim(),
  headcount: Number(form.headcount),
  salaryMin: Number(form.salaryMin),
  salaryMax: Number(form.salaryMax),
  currency: form.currency as JobRequestInput['currency'],
  language,
  processNotes: form.processNotes.trim(),
  interviewersNotes: form.interviewersNotes.trim(),
  location: form.location.trim() === '' ? {} : { city: form.location.trim() },
  ...optional('workMode', form.workMode),
  ...optional('desiredStart', form.desiredStart),
})
