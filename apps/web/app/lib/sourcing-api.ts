import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Sourcing settings of the organization (HTTP). */
const SETTING = '/api/v1/settings/sourcing'
const settingSchema = z.object({ noticeByEmail: z.boolean() })

export const getSourcingNoticeByEmail = async (request: JobApiRequest): Promise<boolean> => (await callApi(request, SETTING, settingSchema)).data.noticeByEmail

export const setSourcingNoticeByEmail = async (request: JobApiRequest, noticeByEmail: boolean): Promise<boolean> =>
  (await callApi(request, SETTING, settingSchema, { method: 'PUT', body: { noticeByEmail } })).data.noticeByEmail
