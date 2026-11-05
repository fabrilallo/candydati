import { describe, expect, it, vi } from 'vitest'
import { connectedApp, consentPreview, SIGNED_QUERY } from '~~/test/fixtures/connected-app-fixtures'
import { answerConsent, continueAuthorization, listConnectedApps, previewConsent, revokeConnectedApp, setActiveOrganization } from './connected-app-api'
import type { JobApiRequest } from './job-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined)

describe('connected apps api', () => {
  it('lists the connected apps of the organization', async () => {
    const request = send(ok([connectedApp('g1'), connectedApp('g2', { clientName: null, userName: null })]))
    const apps = await listConnectedApps(request)
    expect(request.mock.calls[0]).toEqual(['/api/v1/connected-apps', undefined])
    expect(apps.map((app) => app.id)).toEqual(['g1', 'g2'])
    expect(apps[1]?.clientName).toBeNull()
  })

  it('refuses an answer that is not a list of connected apps', async () => {
    const spy = quiet()
    await expect(listConnectedApps(send(ok([{ id: 'g1' }])))).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('revokes one by id', async () => {
    const request = send(ok(connectedApp('g 1')))
    expect((await revokeConnectedApp(request, 'g 1')).id).toBe('g 1')
    expect(request.mock.calls[0]).toEqual(['/api/v1/connected-apps/g%201', { method: 'DELETE' }])
  })
})

describe('consent preview', () => {
  it('sends the signed query back as is', async () => {
    const request = send(ok(consentPreview()))
    const preview = await previewConsent(request, SIGNED_QUERY)
    expect(request.mock.calls[0]).toEqual(['/api/v1/connected-apps/consent-preview', { method: 'POST', body: { oauthQuery: SIGNED_QUERY } }])
    expect(preview.client.redirectUri).toBe('https://claude.ai/api/mcp/auth_callback')
    expect(preview.organizations).toHaveLength(2)
  })

  it('reports an expired request', async () => {
    const request = send({ status: 400, body: { success: false, data: null, error: { code: 'invalid_request', message: 'expired' } } })
    await expect(previewConsent(request, SIGNED_QUERY)).rejects.toMatchObject({ key: 'oauth.errors.expired' })
  })
})

describe('authorization steps', () => {
  it('continues after login and answers the consent with the signed query', async () => {
    const next = send({ status: 200, body: { redirect: true, url: '/oauth/consent?x=1' } })
    expect(await continueAuthorization(next, SIGNED_QUERY)).toBe('/oauth/consent?x=1')
    expect(next.mock.calls[0]).toEqual(['/api/auth/oauth2/continue', { method: 'POST', body: { postLogin: true, oauth_query: SIGNED_QUERY } }])

    const answer = send({ status: 200, body: { redirect: true, url: 'https://claude.ai/api/mcp/auth_callback?code=c&state=s' } })
    expect(await answerConsent(answer, SIGNED_QUERY, true)).toBe('https://claude.ai/api/mcp/auth_callback?code=c&state=s')
    expect(answer.mock.calls[0]).toEqual(['/api/auth/oauth2/consent', { method: 'POST', body: { accept: true, oauth_query: SIGNED_QUERY } }])
    await answerConsent(answer, SIGNED_QUERY, true, 'mcp offline_access')
    expect(answer.mock.calls[1]).toEqual(['/api/auth/oauth2/consent', { method: 'POST', body: { accept: true, oauth_query: SIGNED_QUERY, scope: 'mcp offline_access' } }])
    await answerConsent(answer, SIGNED_QUERY, false, 'mcp')
    expect(answer.mock.calls[2]).toEqual(['/api/auth/oauth2/consent', { method: 'POST', body: { accept: false, oauth_query: SIGNED_QUERY } }])
  })

  it('maps the refusal codes of Better Auth and of OAuth', async () => {
    const twoFactor = send({ status: 403, body: { code: 'TWO_FACTOR_REQUIRED', message: 'no' } })
    await expect(answerConsent(twoFactor, SIGNED_QUERY, true)).rejects.toMatchObject({ key: 'oauth.errors.twoFactorRequired' })
    const oauth = send({ status: 400, body: { error: 'invalid_request', error_description: 'bad sig' } })
    await expect(continueAuthorization(oauth, SIGNED_QUERY)).rejects.toMatchObject({ key: 'oauth.errors.expired' })
  })

  it('refuses a destination that is not safe to follow', async () => {
    const spy = quiet()
    await expect(answerConsent(send({ status: 200, body: { redirect: true, url: 'javascript:alert(1)' } }), SIGNED_QUERY, false)).rejects.toMatchObject({ key: 'oauth.errors.generic' })
    await expect(answerConsent(send({ status: 200, body: { ok: true } }), SIGNED_QUERY, false)).rejects.toMatchObject({ key: 'oauth.errors.generic' })
    spy.mockRestore()
  })

  it('reports an unreachable api', async () => {
    const spy = quiet()
    await expect(continueAuthorization(vi.fn<JobApiRequest>(async () => Promise.reject(new Error('down'))), SIGNED_QUERY)).rejects.toMatchObject({ key: 'errors.unreachable' })
    spy.mockRestore()
  })

  it('switches the active organization', async () => {
    const request = send({ status: 200, body: { id: 'o2', name: 'Globex' } })
    await setActiveOrganization(request, 'o2')
    expect(request.mock.calls[0]).toEqual(['/api/auth/organization/set-active', { method: 'POST', body: { organizationId: 'o2' } }])
    await expect(setActiveOrganization(send({ status: 403, body: { code: 'NOT_A_MEMBER' } }), 'o9')).rejects.toMatchObject({ key: 'oauth.errors.notAMember' })
  })
})
