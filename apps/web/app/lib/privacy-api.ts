import type { Locale, PrivacyNoticeInput } from '@tt/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import { privacyNoticeSchema, privacyTemplateSchema, type PrivacyNoticeDto } from './candidate-schemas'
import type { JobApiRequest } from './job-api'

const BASE = '/api/v1/privacy-notice'

/** The active notice of the organization, `null` while none has been published. Any member may read it. */
export const getActivePrivacyNotice = async (request: JobApiRequest): Promise<PrivacyNoticeDto | null> =>
  (await callApi(request, BASE, privacyNoticeSchema.nullable())).data

/** Every version, newest first (`privacy:manage`). */
export const listPrivacyVersions = async (request: JobApiRequest): Promise<readonly PrivacyNoticeDto[]> =>
  (await callApi(request, `${BASE}/versions`, z.array(privacyNoticeSchema))).data

/** A default text with the organization name filled in, for the controller to review. */
export const getPrivacyTemplate = async (request: JobApiRequest, language: Locale): Promise<string> =>
  (await callApi(request, `${BASE}/template?language=${language}`, privacyTemplateSchema)).data.text

/** Publishes a new immutable version; new applications use it from now on. */
export const publishPrivacyNotice = async (request: JobApiRequest, input: PrivacyNoticeInput): Promise<PrivacyNoticeDto> =>
  (await callApi(request, BASE, privacyNoticeSchema, { method: 'POST', body: input })).data
