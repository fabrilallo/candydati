import { describe, expect, it, vi } from 'vitest'
import { emptyApplyValues } from './application-form'
import { fetchLinkedInEnabled, LINKEDIN_NOTICE_KEYS, takeLinkedInPrefill, withLinkedInPrefill } from './linkedin-prefill'

const envelope = (data: unknown) => ({ success: true, data, error: null })

describe('fetchLinkedInEnabled', () => {
  it('reads the flag, and treats any failure as off (the form works without it)', async () => {
    expect(await fetchLinkedInEnabled(async () => ({ status: 200, body: envelope({ enabled: true }) }))).toBe(true)
    expect(await fetchLinkedInEnabled(async () => ({ status: 200, body: envelope({ enabled: false }) }))).toBe(false)
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await fetchLinkedInEnabled(async () => ({ status: 503, body: null }))).toBe(false)
    expect(await fetchLinkedInEnabled(async () => Promise.reject(new Error('down')))).toBe(false)
    quiet.mockRestore()
  })
})

describe('takeLinkedInPrefill', () => {
  it('posts once and validates what comes back', async () => {
    const request = vi.fn(async () => ({ status: 200, body: envelope({ status: 'filled', prefill: { firstName: 'Giulia', lastName: 'Rossi', email: null } }) }))
    expect(await takeLinkedInPrefill(request)).toEqual({ status: 'filled', prefill: { firstName: 'Giulia', lastName: 'Rossi', email: null } })
    expect(request).toHaveBeenCalledWith('/api/v1/public/linkedin/prefill', { method: 'POST' })
  })

  it('turns an unexpected answer or an outage into a failure the form can show', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await takeLinkedInPrefill(async () => ({ status: 200, body: envelope({ status: 'filled', prefill: { picture: 'x' } }) }))).toEqual({ status: 'failed' })
    expect(await takeLinkedInPrefill(async () => Promise.reject(new Error('down')))).toEqual({ status: 'failed' })
    quiet.mockRestore()
  })
})

describe('withLinkedInPrefill', () => {
  it('fills only the fields LinkedIn gave, keeping the rest of the form', () => {
    const values = { ...emptyApplyValues(), phone: '+39 333', email: 'typed@example.com' }
    expect(withLinkedInPrefill(values, { firstName: 'Giulia', lastName: '', email: null })).toEqual({ ...values, firstName: 'Giulia' })
    expect(withLinkedInPrefill(values, { firstName: 'G', lastName: 'R', email: 'giulia@example.com' })).toMatchObject({ firstName: 'G', lastName: 'R', email: 'giulia@example.com', phone: '+39 333' })
    expect(values.firstName).toBe('')
  })
})

describe('LINKEDIN_NOTICE_KEYS', () => {
  it('has a message for every outcome but none', () => {
    expect(Object.keys(LINKEDIN_NOTICE_KEYS).sort()).toEqual(['cancelled', 'failed', 'filled'])
  })
})
