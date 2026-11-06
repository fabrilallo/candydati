import { describe, expect, it } from 'vitest'
import { helloExtension, takePendingProfile } from './extension-save'

const PROFILE = { profileUrl: 'https://www.linkedin.com/in/giulia-verdi/', fullName: 'Giulia Verdi', headline: 'Backend engineer', location: 'Torino', text: '' }

const runtimeAnswering = (response: unknown, lastError?: { message: string }) => {
  const sent: unknown[] = []
  return {
    sent,
    lastError,
    sendMessage: (_id: string, message: unknown, callback: (response: unknown) => void) => {
      sent.push(message)
      callback(response)
    },
  }
}

describe('extension save bridge', () => {
  it('says hello to the extension, and does nothing without one', async () => {
    const runtime = runtimeAnswering({ ok: true })
    await helloExtension(runtime, 'ext')
    expect(runtime.sent).toEqual([{ type: 'candydati.hello' }])
    await expect(helloExtension(null, 'ext')).resolves.toBeUndefined()
  })

  it('gives the pending profile, or none', async () => {
    expect(await takePendingProfile(runtimeAnswering({ ok: true, profile: PROFILE }), 'ext')).toEqual({ ok: true, profile: PROFILE })
    expect(await takePendingProfile(runtimeAnswering({ ok: true, profile: null }), 'ext')).toEqual({ ok: true, profile: null })
  })

  it('says the extension is missing without runtime, id or receiver, and refuses a wrong answer or silence', async () => {
    expect(await takePendingProfile(null, 'ext')).toEqual({ ok: false, error: 'extension_missing' })
    expect(await takePendingProfile(runtimeAnswering({}), '')).toEqual({ ok: false, error: 'extension_missing' })
    expect(await takePendingProfile(runtimeAnswering(undefined, { message: 'no receiver' }), 'ext')).toEqual({ ok: false, error: 'extension_missing' })
    expect(await takePendingProfile({ sendMessage: () => { throw new Error('bad id') } }, 'ext')).toEqual({ ok: false, error: 'extension_missing' })
    expect(await takePendingProfile(runtimeAnswering({ ok: true, profile: { ...PROFILE, profileUrl: 'javascript:alert(1)' } }), 'ext')).toEqual({ ok: false, error: 'failed' })
    expect(await takePendingProfile({ sendMessage: () => undefined }, 'ext', 5)).toEqual({ ok: false, error: 'failed' })
  })
})
