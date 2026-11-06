import { addSourcedResultSchema, sourcedContactSchema, sourcedNoticeTextSchema, type AddSourcedResultDto, type LinkedinProfile, type SourcedContactDto, type SourcedContactInput } from '@candydati/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'

/** Sourcing (HTTP): the organization's setting and the contacts sourced for a job. */
const SETTING = '/api/v1/settings/sourcing'
const settingSchema = z.object({ noticeByEmail: z.boolean() })

export const getSourcingNoticeByEmail = async (request: JobApiRequest): Promise<boolean> => (await callApi(request, SETTING, settingSchema)).data.noticeByEmail

export const setSourcingNoticeByEmail = async (request: JobApiRequest, noticeByEmail: boolean): Promise<boolean> =>
  (await callApi(request, SETTING, settingSchema, { method: 'PUT', body: { noticeByEmail } })).data.noticeByEmail

const contactsOf = (jobId: string): string => `/api/v1/jobs/${encodeURIComponent(jobId)}/sourced-contacts`
const contact = (id: string): string => `/api/v1/sourced-contacts/${encodeURIComponent(id)}`

export const listContacts = async (request: JobApiRequest, jobId: string): Promise<readonly SourcedContactDto[]> => (await callApi(request, contactsOf(jobId), z.array(sourcedContactSchema))).data

export const addContacts = async (request: JobApiRequest, jobId: string, contacts: readonly SourcedContactInput[]): Promise<readonly AddSourcedResultDto[]> =>
  (await callApi(request, contactsOf(jobId), z.array(addSourcedResultSchema), { method: 'POST', body: { contacts } })).data

/** The short notice for a first message, with a fresh personal link (the previous one stops working). */
export const noticeText = async (request: JobApiRequest, contactId: string): Promise<{ readonly text: string; readonly url: string }> =>
  (await callApi(request, `${contact(contactId)}/notice`, sourcedNoticeTextSchema, { method: 'POST', body: {} })).data

export const markContacted = async (request: JobApiRequest, contactId: string): Promise<SourcedContactDto> =>
  (await callApi(request, `${contact(contactId)}/contacted`, sourcedContactSchema, { method: 'POST', body: {} })).data

export const deleteContact = async (request: JobApiRequest, contactId: string, doNotContact: boolean): Promise<void> => {
  await callApi(request, `${contact(contactId)}${doNotContact ? '?doNotContact=true' : ''}`, z.unknown(), { method: 'DELETE' })
}

const LINKEDIN = '/api/v1/sourcing/linkedin'
const linkedinStatusSchema = z.object({ enabled: z.boolean(), maxProfilesPerRun: z.number(), accepted: z.boolean(), textVersion: z.number() })
export type LinkedinStatusDto = z.output<typeof linkedinStatusSchema>

export const getLinkedinStatus = async (request: JobApiRequest): Promise<LinkedinStatusDto> => (await callApi(request, `${LINKEDIN}/status`, linkedinStatusSchema)).data

export const acceptLinkedinRisk = async (request: JobApiRequest, textVersion: number): Promise<void> => {
  await callApi(request, `${LINKEDIN}/accept`, z.unknown(), { method: 'POST', body: { textVersion } })
}

export const setLinkedinSetting = async (request: JobApiRequest, value: { readonly enabled: boolean; readonly maxProfilesPerRun: number }): Promise<{ enabled: boolean; maxProfilesPerRun: number }> =>
  (await callApi(request, '/api/v1/settings/linkedin-sourcing', z.object({ enabled: z.boolean(), maxProfilesPerRun: z.number() }), { method: 'PUT', body: value })).data

/** What the extension read, sealed by the api: what the model may see (first names, facts) and opaque references. */
export const sealLinkedinResults = async (request: JobApiRequest, body: { jobId: string; keywords: readonly string[]; location: string | null; profiles: readonly LinkedinProfile[] }): Promise<unknown> =>
  (await callApi(request, `${LINKEDIN}/results`, z.record(z.string(), z.unknown()), { method: 'POST', body })).data
