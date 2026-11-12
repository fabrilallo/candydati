import { calendarConnectionStatusSchema, GOOGLE_CALENDAR_ROUTE_BASE, type CalendarConnectionStatusDto } from '@candydati/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** A browser navigation (not a fetch): the api answers with a redirect to Google's consent screen. */
export const GOOGLE_CALENDAR_START_URL = `${GOOGLE_CALENDAR_ROUTE_BASE}/start`

export const getMyCalendarConnection = async (request: JobApiRequest): Promise<CalendarConnectionStatusDto> =>
  (await callApi(request, GOOGLE_CALENDAR_ROUTE_BASE, calendarConnectionStatusSchema)).data

export const disconnectMyGoogleCalendar = async (request: JobApiRequest): Promise<void> => {
  await callApi(request, GOOGLE_CALENDAR_ROUTE_BASE, z.unknown(), { method: 'DELETE' })
}
