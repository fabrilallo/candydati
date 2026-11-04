import { connectedAppSchema, consentPreviewSchema, type ConnectedApp, type ConsentPreview } from '@candydati/domain'
import { z } from 'zod'
import { ApiFailure, callApi, type FailureInfo } from './api-call'
import { AppError } from './auth-errors'
import type { ApiCall, JobApiRequest } from './job-api'
import { oauthFailureKey, safeNextUrl } from './oauth-flow'
import { CONNECTED_APPS_PATH, CONSENT_PREVIEW_PATH, connectedAppPath, OAUTH_CONSENT_PATH, OAUTH_CONTINUE_PATH, SET_ACTIVE_ORGANIZATION_PATH } from './api-paths'

/** Connected apps of the organization (settings) and the calls of the OAuth pages that create them. */
export const listConnectedApps = async (request: JobApiRequest): Promise<readonly ConnectedApp[]> =>
  (await callApi(request, CONNECTED_APPS_PATH, z.array(connectedAppSchema))).data

/** The app stops working at once: its tokens are gone. */
export const revokeConnectedApp = async (request: JobApiRequest, id: string): Promise<ConnectedApp> =>
  (await callApi(request, connectedAppPath(id), connectedAppSchema, { method: 'DELETE' })).data

/** What the consent page shows, for the signed request it received (422 once expired or tampered with). */
export const previewConsent = async (request: JobApiRequest, oauthQuery: string): Promise<ConsentPreview> =>
  (await callApi(request, CONSENT_PREVIEW_PATH, consentPreviewSchema, { method: 'POST', body: { oauthQuery } }, oauthFailureKey)).data

/** Better Auth refusals: `{ code, message }`, or an OAuth error `{ error, error_description }`. */
const authFailureSchema = z.union([z.object({ code: z.string() }), z.object({ error: z.string() })])
const redirectSchema = z.object({ redirect: z.literal(true), url: z.string() })

const failureOf = (status: number, body: unknown): FailureInfo => {
  const parsed = authFailureSchema.safeParse(body)
  const code = parsed.success ? ('code' in parsed.data ? parsed.data.code : parsed.data.error) : null
  return { status, code, message: null, issues: [] }
}

/** One Better Auth call (no envelope): every failure becomes an `ApiFailure` with an OAuth page key. */
const callAuth = async (request: JobApiRequest, path: string, body: Record<string, unknown>): Promise<unknown> => {
  const call: ApiCall = { method: 'POST', body }
  const response = await request(path, call).catch((cause: unknown) => {
    console.error('[oauth] request failed', path, cause instanceof Error ? cause.message : cause)
    const failure: FailureInfo = { status: 0, code: null, message: null, issues: [] }
    throw new ApiFailure(oauthFailureKey(failure), failure)
  })
  if (response.status >= 400) {
    const failure = failureOf(response.status, response.body)
    throw new ApiFailure(oauthFailureKey(failure), failure)
  }
  return response.body
}

/** The next address the server sends the browser to, only when it is safe to follow. */
const nextUrlOf = (path: string, body: unknown): string => {
  const parsed = redirectSchema.safeParse(body)
  const url = parsed.success ? safeNextUrl(parsed.data.url) : null
  if (url === null) {
    console.error('[oauth] unexpected or unsafe redirect', path)
    throw new AppError('oauth.errors.generic', 'invalid_response')
  }
  return url
}

/** After signing in: the server checks the session and answers with the consent page (or the app, if already granted). */
export const continueAuthorization = async (request: JobApiRequest, oauthQuery: string): Promise<string> =>
  nextUrlOf(OAUTH_CONTINUE_PATH, await callAuth(request, OAUTH_CONTINUE_PATH, { postLogin: true, oauth_query: oauthQuery }))

/** Allow or deny: the answer is the app's redirect address, with the code or the error. */
export const answerConsent = async (request: JobApiRequest, oauthQuery: string, accept: boolean): Promise<string> =>
  nextUrlOf(OAUTH_CONSENT_PATH, await callAuth(request, OAUTH_CONSENT_PATH, { accept, oauth_query: oauthQuery }))

/** The grant is for the session's active organization: switch first when the person picked another one. */
export const setActiveOrganization = async (request: JobApiRequest, organizationId: string): Promise<void> => {
  await callAuth(request, SET_ACTIVE_ORGANIZATION_PATH, { organizationId })
}
