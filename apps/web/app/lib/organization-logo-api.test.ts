import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from './api-call'
import type { JobApiRequest } from './job-api'
import { getOrganizationLogo, ORGANIZATION_LOGO_PATH, setOrganizationLogo } from './organization-logo-api'

const MEDIA_ID = '11111111-1111-4111-8111-111111111111'
const LOGO = { source: { kind: 'media', mediaId: MEDIA_ID }, url: `/api/v1/public/organizations/acme/careers-media/${MEDIA_ID}/0123456789abcdef-w640.webp` }
const send = (status: number, body: unknown) => vi.fn<JobApiRequest>(async () => ({ status, body }))

describe('organization logo api', () => {
  it('reads the logo', async () => {
    const request = send(200, { success: true, data: LOGO, error: null })
    expect(await getOrganizationLogo(request)).toEqual(LOGO)
    expect(request.mock.calls[0]?.[0]).toBe(ORGANIZATION_LOGO_PATH)
  })

  it('sends the new source, or null to remove it', async () => {
    const request = send(200, { success: true, data: { source: null, url: null }, error: null })
    expect(await setOrganizationLogo(request, null)).toEqual({ source: null, url: null })
    expect(request.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', body: { source: null } })
  })

  it('names the refusal of a video', async () => {
    const request = send(422, { success: false, data: null, error: { code: 'validation_failed', message: 'no', issues: [{ path: 'source.mediaId', message: 'logo_not_image' }] } })
    const error = await setOrganizationLogo(request, { kind: 'media', mediaId: MEDIA_ID }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).key).toBe('careersEditor.media.errors.logo_not_image')
  })
})
