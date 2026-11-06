import { describe, expect, it } from 'vitest'
import { searchLinkedinWithExtension, searchWebWithExtension } from './extension-bridge'

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

describe('extension bridge, web search', () => {
  const web = { type: 'candydati.search_web', query: 'site:github.com Rust Milano', limit: 5 } as const
  const result = { url: 'https://github.com/gverdi', title: 'gverdi (Giulia Verdi) · GitHub', snippet: 'Rust' }

  it('passes on the Google results read, and the consent page or the traffic check', async () => {
    expect(await searchWebWithExtension(runtimeAnswering({ ok: true, results: [result] }), 'ext', web)).toEqual({ ok: true, results: [result] })
    expect(await searchWebWithExtension(runtimeAnswering({ ok: false, error: 'consent_required' }), 'ext', web)).toEqual({ ok: false, error: 'consent_required' })
    expect(await searchWebWithExtension(null, 'ext', web)).toEqual({ ok: false, error: 'extension_missing' })
  })

  it('refuses results of the wrong shape', async () => {
    expect(await searchWebWithExtension(runtimeAnswering({ ok: true, results: [{ ...result, url: 'javascript:x' }] }), 'ext', web)).toEqual({ ok: false, error: 'failed' })
    expect(await searchWebWithExtension(runtimeAnswering({ ok: true, profiles: [] }), 'ext', web)).toEqual({ ok: false, error: 'failed' })
  })
})
