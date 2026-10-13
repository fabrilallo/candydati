import { type EmailTemplateKind, emailSettingsSchema, emailTemplateSchema, messageSchema, sendResultSchema, templatePreviewSchema, type EmailSettingsDto, type EmailTemplateDto, type MessageDto, type TemplatePreviewDto    } from '@tt/domain';
import { z } from 'zod'
import { ApiFailure, callApi, defaultFailureKey, type FailureKey } from './api-call'
import type { JobApiRequest } from './job-api'

const id = (value: string): string => encodeURIComponent(value)
const TEMPLATES = '/api/v1/email-templates'
const SETTINGS = '/api/v1/email-settings'
const UNKNOWN_VARIABLE = 'unknown_variable:'

export interface MessageDraft {
  readonly applicationIds: readonly string[]
  readonly templateId: string | null
  readonly subject: string
  readonly body: string
}

export interface TemplateInput {
  readonly name: string
  readonly kind: EmailTemplateKind
  readonly subject: string
  readonly body: string
}

export interface EmailSettingsInput {
  readonly senderName: string
  readonly fromAddress: string | null
}

/** A refused send names the variable that is not known: say so instead of a generic validation error. */
export const sendFailureKey: FailureKey = (failure) =>
  failure.issues.some((issue) => issue.message.startsWith(UNKNOWN_VARIABLE) || issue.path.startsWith(UNKNOWN_VARIABLE)) ? 'messages.errors.unknownVariable' : defaultFailureKey(failure)

/** Pure: the unknown variables an `ApiFailure` reports (`unknown_variable:<name>` issues). */
export const unknownFromFailure = (error: unknown): readonly string[] => {
  if (!(error instanceof ApiFailure)) return []
  return error.failure.issues.flatMap((issue) => [issue.message, issue.path]).filter((text) => text.startsWith(UNKNOWN_VARIABLE)).map((text) => text.slice(UNKNOWN_VARIABLE.length))
}

/** One application's conversation, oldest first (`message:read`). */
export const listMessages = async (request: JobApiRequest, applicationId: string): Promise<readonly MessageDto[]> =>
  (await callApi(request, `/api/v1/applications/${id(applicationId)}/messages`, z.array(messageSchema))).data

/** Queues one message per application. A person confirmed it in the interface; the api never sends on its own. */
export const sendMessages = async (request: JobApiRequest, draft: MessageDraft): Promise<number> =>
  (
    await callApi(
      request,
      '/api/v1/messages',
      sendResultSchema,
      { method: 'POST', body: { applicationIds: draft.applicationIds, subject: draft.subject, body: draft.body, ...(draft.templateId ? { templateId: draft.templateId } : {}) } },
      sendFailureKey,
    )
  ).data.queued

/** Subject and body rendered for one application's candidate, with the variables the api did not know. */
export const previewMessage = async (request: JobApiRequest, input: { readonly subject: string; readonly body: string; readonly applicationId: string }): Promise<TemplatePreviewDto> =>
  (await callApi(request, `${TEMPLATES}/preview`, templatePreviewSchema, { method: 'POST', body: input })).data

/** Every template of the organization, defaults included (`isDefault`). */
export const listTemplates = async (request: JobApiRequest): Promise<readonly EmailTemplateDto[]> => (await callApi(request, TEMPLATES, z.array(emailTemplateSchema))).data

export const createTemplate = async (request: JobApiRequest, input: TemplateInput): Promise<EmailTemplateDto> =>
  (await callApi(request, TEMPLATES, emailTemplateSchema, { method: 'POST', body: input })).data

export const updateTemplate = async (request: JobApiRequest, templateId: string, input: TemplateInput): Promise<EmailTemplateDto> =>
  (await callApi(request, `${TEMPLATES}/${id(templateId)}`, emailTemplateSchema, { method: 'PUT', body: input })).data

/** Deletes a custom template; on an edited default it brings the default text back. */
export const deleteTemplate = async (request: JobApiRequest, templateId: string): Promise<void> => {
  await callApi(request, `${TEMPLATES}/${id(templateId)}`, z.unknown(), { method: 'DELETE' })
}

export const getEmailSettings = async (request: JobApiRequest): Promise<EmailSettingsDto> => (await callApi(request, SETTINGS, emailSettingsSchema)).data

export const updateEmailSettings = async (request: JobApiRequest, input: EmailSettingsInput): Promise<EmailSettingsDto> =>
  (await callApi(request, SETTINGS, emailSettingsSchema, { method: 'PUT', body: input })).data

/** Asks the provider again whether the DNS records of the own domain are in place. */
export const verifyEmailDomain = async (request: JobApiRequest): Promise<EmailSettingsDto> =>
  (await callApi(request, `${SETTINGS}/verify`, emailSettingsSchema, { method: 'POST' })).data
