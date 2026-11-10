import {
  CALENDAR_FEED_ERRORS,
  calendarFeedInputSchema,
  calendarPreferencesInputSchema,
  INTERVIEW_MODES,
  INTERVIEW_STATUSES,
  SUPPORTED_LOCALES,
  proposeInterviewInputSchema,
  workingHoursSchema,
  type CalendarFeedInput,
  type CalendarPreferencesInput,
  type InterviewMode,
} from '@candydati/domain'
import { z } from 'zod'
import { ApiFailure, callApi } from './api-call'
import {
  applicationInterviewsPath,
  cancelInterviewPath,
  MY_CALENDAR_FEED_PATH,
  publicInterviewBookPath,
  publicInterviewCancelPath,
  publicInterviewPath,
} from './api-paths'
import { bookingFailure, type BookingFailure } from './interview-view'
import type { JobApiRequest } from './job-api'

/** Interview scheduling over HTTP: the person's own calendar, an application's interviews, the candidate's page. */

const iso = z.string().min(1)

export const calendarFeedViewSchema = z.object({
  connected: z.boolean(),
  host: z.string().nullable(),
  timeZone: z.string().nullable(),
  workingHours: workingHoursSchema,
  fetchedAt: iso.nullable(),
  lastError: z.enum(CALENDAR_FEED_ERRORS).nullable(),
})
export type CalendarFeedViewDto = z.infer<typeof calendarFeedViewSchema>

export const interviewViewSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  stageId: z.string(),
  status: z.enum(INTERVIEW_STATUSES),
  startsAt: iso.nullable(),
  endsAt: iso.nullable(),
  durationMinutes: z.number().int().positive(),
  mode: z.enum(INTERVIEW_MODES),
  location: z.string().nullable(),
  interviewers: z.array(z.object({ kind: z.enum(['member', 'external']), userId: z.string().nullable(), name: z.string() })),
  proposedBy: z.string(),
  createdAt: iso,
  bookedAt: iso.nullable(),
  cancelledAt: iso.nullable(),
  cancelledBy: z.string().nullable(),
})
export type InterviewViewDto = z.infer<typeof interviewViewSchema>

export const proposeResultSchema = z.object({ interview: interviewViewSchema, freeSlots: z.number().int().nonnegative(), withoutCalendar: z.array(z.string()) })
export type ProposeResultDto = z.infer<typeof proposeResultSchema>

export const publicInterviewSchema = z.object({
  organizationName: z.string(),
  language: z.enum(SUPPORTED_LOCALES),
  firstName: z.string(),
  jobTitle: z.string(),
  stageLabel: z.string(),
  durationMinutes: z.number().int().positive(),
  mode: z.enum(INTERVIEW_MODES),
  location: z.string().nullable(),
  interviewers: z.array(z.string()),
  status: z.enum(INTERVIEW_STATUSES),
  startsAt: iso.nullable(),
  canChange: z.boolean(),
  slots: z.array(iso),
})
export type PublicInterviewDto = z.infer<typeof publicInterviewSchema>

const bookResultSchema = z.object({ status: z.literal('booked'), startsAt: iso, endsAt: iso, token: z.string().min(1) })
export type BookResultDto = z.infer<typeof bookResultSchema>

/** A form the api would refuse is refused here first, in the same shape (422 with issues). */
const checked = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  throw new ApiFailure('errors.generic', { status: 422, code: 'validation_failed', message: null, issues })
}

export const getMyCalendarFeed = async (request: JobApiRequest): Promise<CalendarFeedViewDto> =>
  (await callApi(request, MY_CALENDAR_FEED_PATH, calendarFeedViewSchema)).data

export const saveCalendarFeed = async (request: JobApiRequest, input: CalendarFeedInput): Promise<CalendarFeedViewDto> =>
  (await callApi(request, MY_CALENDAR_FEED_PATH, calendarFeedViewSchema, { method: 'PUT', body: checked(calendarFeedInputSchema, input) })).data

export const updateCalendarHours = async (request: JobApiRequest, input: CalendarPreferencesInput): Promise<CalendarFeedViewDto> =>
  (await callApi(request, MY_CALENDAR_FEED_PATH, calendarFeedViewSchema, { method: 'PATCH', body: checked(calendarPreferencesInputSchema, input) })).data

export const disconnectCalendarFeed = async (request: JobApiRequest): Promise<void> => {
  await callApi(request, MY_CALENDAR_FEED_PATH, z.unknown(), { method: 'DELETE' })
}

export const listInterviews = async (request: JobApiRequest, applicationId: string): Promise<readonly InterviewViewDto[]> =>
  (await callApi(request, applicationInterviewsPath(applicationId), z.array(interviewViewSchema))).data

export interface ProposeForm {
  readonly stageId: string
  readonly mode: InterviewMode
  readonly location: string
}

/** The stage's interviewers take part (the api reads them); an empty location is left out. */
export const proposeInterview = async (request: JobApiRequest, applicationId: string, form: ProposeForm): Promise<ProposeResultDto> => {
  const location = form.location.trim()
  const body = checked(proposeInterviewInputSchema, { stageId: form.stageId, mode: form.mode, ...(location ? { location } : {}) })
  return (await callApi(request, applicationInterviewsPath(applicationId), proposeResultSchema, { method: 'POST', body })).data
}

export const cancelApplicationInterview = async (request: JobApiRequest, interviewId: string): Promise<InterviewViewDto> =>
  (await callApi(request, cancelInterviewPath(interviewId), interviewViewSchema, { method: 'POST', body: {} })).data

export type PublicInterviewLoad = { readonly kind: 'ok'; readonly data: PublicInterviewDto } | { readonly kind: 'failed'; readonly failure: BookingFailure }

/** Never throws: the page shows the invitation or the reason it cannot. */
export const loadPublicInterview = async (request: JobApiRequest, token: string): Promise<PublicInterviewLoad> => {
  try {
    return { kind: 'ok', data: (await callApi(request, publicInterviewPath(token), publicInterviewSchema)).data }
  } catch (error) {
    const failure = bookingFailure(error)
    if (failure === 'unavailable') console.error('[interview] load failed', error instanceof Error ? error.message : error)
    return { kind: 'failed', failure }
  }
}

export const bookInterviewSlot = async (request: JobApiRequest, token: string, slot: string): Promise<BookResultDto> =>
  (await callApi(request, publicInterviewBookPath(token), bookResultSchema, { method: 'POST', body: { slot } })).data

export const cancelInterviewAsCandidate = async (request: JobApiRequest, token: string): Promise<void> => {
  await callApi(request, publicInterviewCancelPath(token), z.unknown(), { method: 'POST', body: {} })
}
