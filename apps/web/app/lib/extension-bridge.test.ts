import { describe, expect, it } from 'vitest'
import { searchLinkedinWithExtension } from './extension-bridge'

const request = { type: 'candydati.search_linkedin', keywords: ['Go'], location: null, limit: 5 } as const
const runtimeAnswering = (response: unknown, lastError?: { message: string }) => ({
  lastError,
  sendMessage: (_id: string, _message: unknown, callback: (response: unknown) => void) => callback(response),
})

describe('extension bridge', () => {
  it('says the extension is missing without a Chrome runtime or an extension id, or when Chrome reports no receiver', async () => {
    expect(await searchLinkedinWithExtension(null, 'ext', request)).toEqual({ ok: false, error: 'extension_missing' })
    expect(await searchLinkedinWithExtension(runtimeAnswering({}), '', request)).toEqual({ ok: false, error: 'extension_missing' })
    expect(await searchLinkedinWithExtension(runtimeAnswering(undefined, { message: 'Could not establish connection' }), 'ext', request)).toEqual({ ok: false, error: 'extension_missing' })
  })

  it('passes on the profiles read, and the reasons the extension stopped', async () => {
    const profile = { profileUrl: 'https://www.linkedin.com/in/maja', fullName: 'Maja Lind', headline: null, location: null, text: '' }
    expect(await searchLinkedinWithExtension(runtimeAnswering({ ok: true, profiles: [profile] }), 'ext', request)).toEqual({ ok: true, profiles: [profile] })
    expect(await searchLinkedinWithExtension(runtimeAnswering({ ok: false, error: 'captcha' }), 'ext', request)).toEqual({ ok: false, error: 'captcha' })
  })

  it('refuses an answer of the wrong shape and gives up after the timeout', async () => {
    expect(await searchLinkedinWithExtension(runtimeAnswering({ ok: true, profiles: [{ profileUrl: 'javascript:x' }] }), 'ext', request)).toEqual({ ok: false, error: 'failed' })
    const silent = { sendMessage: () => undefined }
    expect(await searchLinkedinWithExtension(silent, 'ext', request, 5)).toEqual({ ok: false, error: 'failed' })
  })
})
