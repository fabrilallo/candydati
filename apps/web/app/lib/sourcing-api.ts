import { addSourcedResultSchema, sourcedContactSchema, sourcedNoticeTextSchema, type AddSourcedResultDto, type SourcedContactDto, type SourcedContactInput } from '@candydati/domain'
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
