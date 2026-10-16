import { CV_MAX_BYTES } from '@candydati/domain'
import { describe, expect, it, vi } from 'vitest'
import { applicationErrorKey, applicationsUrl, emptyApplyValues, needsNoticeReload, submitApplication, toApplicationForm } from './application-form'
import { ApiFailure } from './api-call'
import { checkCvFile, cvKind, formatBytes } from './cv-file'
import type { JobApiRequest } from './job-api'

const filled = { ...emptyApplyValues(), firstName: ' Giulia ', lastName: 'Rossi', email: 'Giulia@Example.com', selection: true }

describe('toApplicationForm', () => {
  it('builds the payload of the contract, without empty optional fields', () => {
    const result = toApplicationForm(filled, 3)
    expect(result).toEqual({
      ok: true,
      form: { firstName: 'Giulia', lastName: 'Rossi', email: 'giulia@example.com', message: '', consentScopes: ['selection'], privacyNoticeVersion: 3 },
    })
  })

  it('adds the talent pool only when chosen, and the optional contacts', () => {
    const result = toApplicationForm({ ...filled, talentPool: true, phone: '+39 333 123 4567', linkedinUrl: 'linkedin.com/in/giulia', message: ' Ciao ' }, 1)
    expect(result.ok && result.form).toMatchObject({ consentScopes: ['selection', 'talent_pool'], phone: '+39 333 123 4567', linkedinUrl: 'https://linkedin.com/in/giulia', message: 'Ciao' })
  })

  it('maps each problem to a field and a translation key', () => {
    const result = toApplicationForm({ ...emptyApplyValues(), email: 'nope', phone: 'abc', linkedinUrl: 'ht tp://x' }, 3)
    expect(result).toEqual({
      ok: false,
      errors: {
        firstName: 'apply.validation.required',
        lastName: 'apply.validation.required',
        email: 'apply.validation.email',
        phone: 'apply.validation.phone',
        linkedinUrl: 'apply.validation.url',
        selection: 'apply.validation.selection',
      },
    })
  })

  it('keeps a long message out', () => {
    const result = toApplicationForm({ ...filled, message: 'x'.repeat(3001) }, 3)
    expect(result).toEqual({ ok: false, errors: { message: 'apply.validation.messageMax' } })
  })

  it('passes the honeypot through untouched, so the api can drop the submission quietly', () => {
    const result = toApplicationForm({ ...filled, website: 'http://spam.test' }, 3)
    expect(result.ok && result.form.website).toBe('http://spam.test')
  })
})

describe('cv file checks', () => {
  it('accepts a pdf or a docx up to the limit', () => {
    expect(checkCvFile({ name: 'cv.PDF', size: 1000 })).toEqual({ ok: true })
    expect(checkCvFile({ name: 'cv.docx', size: CV_MAX_BYTES })).toEqual({ ok: true })
  })

  it('refuses empty, too large and other formats', () => {
    expect(checkCvFile({ name: 'cv.pdf', size: 0 })).toEqual({ ok: false, reason: 'empty' })
    expect(checkCvFile({ name: 'cv.pdf', size: CV_MAX_BYTES + 1 })).toEqual({ ok: false, reason: 'too_large' })
    expect(checkCvFile({ name: 'cv.doc', size: 10 })).toEqual({ ok: false, reason: 'unsupported' })
    expect(checkCvFile({ name: 'pdf', size: 10 })).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('formats sizes like people read them', () => {
    expect(formatBytes(1_572_864, 'it')).toBe('1,5 MB')
    expect(formatBytes(1_572_864, 'en')).toBe('1.5 MB')
    expect(formatBytes(2048, 'it')).toBe('2 KB')
    expect(formatBytes(300, 'en')).toBe('300 B')
  })

  it('tells pdf from docx by media type or name', () => {
    expect(cvKind('application/pdf', 'x')).toBe('pdf')
    expect(cvKind('application/octet-stream', 'cv.docx')).toBe('docx')
    expect(cvKind('application/octet-stream', 'cv.txt')).toBe('other')
  })
})

describe('application errors', () => {
  const failure = (status: number, code: string | null = null, message: string | null = null) => ({ status, code, message, issues: [] })

  it('maps codes and statuses to calm messages', () => {
    expect(applicationErrorKey(failure(409, 'conflict', 'privacy_notice_outdated'))).toBe('apply.errors.outdated')
    expect(applicationErrorKey(failure(409, 'privacy_notice_outdated', 'x'))).toBe('apply.errors.outdated')
    expect(applicationErrorKey(failure(409, 'conflict', 'already_applied'))).toBe('apply.errors.alreadyApplied')
    expect(applicationErrorKey(failure(415, 'unsupported_file', 'x'))).toBe('apply.errors.unsupportedFile')
    expect(applicationErrorKey(failure(413))).toBe('apply.errors.tooLarge')
    expect(applicationErrorKey(failure(429))).toBe('apply.errors.tooMany')
    expect(applicationErrorKey(failure(422, 'validation_failed', 'x'))).toBe('apply.errors.invalid')
    expect(applicationErrorKey(failure(404, 'not_found', 'x'))).toBe('apply.errors.closed')
    expect(applicationErrorKey(failure(0))).toBe('apply.errors.unreachable')
    expect(applicationErrorKey(failure(500))).toBe('apply.errors.generic')
  })

  it('knows when the notice must be reloaded', () => {
    expect(needsNoticeReload(new ApiFailure('apply.errors.outdated', failure(409, 'conflict', 'privacy_notice_outdated')))).toBe(true)
    expect(needsNoticeReload(new ApiFailure('apply.errors.tooMany', failure(429)))).toBe(false)
    expect(needsNoticeReload(new Error('x'))).toBe(false)
  })
})

describe('submitApplication', () => {
  const form = { firstName: 'G', lastName: 'R', email: 'g@r.it', message: '', consentScopes: ['selection' as const], privacyNoticeVersion: 3 }
  const file = new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' })

  it('posts a multipart body with the json data and the file', async () => {
    const request = vi.fn<JobApiRequest>(async () => ({ status: 201, body: { success: true, data: { received: true }, error: null } }))
    await submitApplication(request, 'acme', 'backend 1', form, file)
    const [url, call] = request.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/public/organizations/acme/jobs/backend%201/applications')
    expect(applicationsUrl('a', 'b')).toBe('/api/v1/public/organizations/a/jobs/b/applications')
    expect(call?.method).toBe('POST')
    const body = call?.body as FormData
    expect(JSON.parse(String(body.get('data')))).toEqual(form)
    expect((body.get('cv') as File).name).toBe('cv.pdf')
  })

  it('adds where the candidate came from to the json data', async () => {
    const request = vi.fn<JobApiRequest>(async () => ({ status: 201, body: { success: true, data: { received: true }, error: null } }))
    await submitApplication(request, 'acme', 'b', form, file, 'linkedin')
    const body = request.mock.calls[0]?.[1]?.body as FormData
    expect(JSON.parse(String(body.get('data')))).toEqual({ ...form, origin: 'linkedin' })
  })

  it('adds the campaign only when the link had one', async () => {
    const request = vi.fn<JobApiRequest>(async () => ({ status: 201, body: { success: true, data: { received: true }, error: null } }))
    await submitApplication(request, 'acme', 'b', form, file, 'linkedin', undefined, 'autumn')
    await submitApplication(request, 'acme', 'b', form, file, 'linkedin', undefined, '')
    const data = (index: number) => JSON.parse(String((request.mock.calls[index]?.[1]?.body as FormData).get('data')))
    expect(data(0)).toEqual({ ...form, origin: 'linkedin', campaign: 'autumn' })
    expect(data(1)).toEqual({ ...form, origin: 'linkedin' })
  })

  it('adds the Turnstile answer only when there is one', async () => {
    const request = vi.fn<JobApiRequest>(async () => ({ status: 201, body: { success: true, data: { received: true }, error: null } }))
    await submitApplication(request, 'acme', 'b', form, file, undefined, 'tok')
    await submitApplication(request, 'acme', 'b', form, file, undefined, '')
    const data = (index: number) => JSON.parse(String((request.mock.calls[index]?.[1]?.body as FormData).get('data')))
    expect(data(0)).toEqual({ ...form, turnstileToken: 'tok' })
    expect(data(1)).toEqual(form)
  })

  it('throws a mapped failure', async () => {
    const request = vi.fn<JobApiRequest>(async () => ({ status: 409, body: { success: false, data: null, error: { code: 'conflict', message: 'already_applied' } } }))
    await expect(submitApplication(request, 'acme', 'b', form, file)).rejects.toMatchObject({ key: 'apply.errors.alreadyApplied' })
  })
})
