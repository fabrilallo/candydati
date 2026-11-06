import { linkedinProfileSchema, type LinkedinProfile } from '@candydati/domain'
import { z } from 'zod'
import type { chromeRuntime } from './extension-bridge'

/**
 * The "Save to Candydati" button of the extension. The app says hello when it loads, so the extension knows where this
 * Candydati is; the save page then asks for the one profile the person clicked on LinkedIn (the extension gives it once
 * and forgets it).
 */
type Runtime = ReturnType<typeof chromeRuntime>

export type PendingProfileAnswer =
  | { readonly ok: true; readonly profile: LinkedinProfile | null }
  | { readonly ok: false; readonly error: 'extension_missing' | 'failed' }

const pendingSchema = z.object({ ok: z.literal(true), profile: linkedinProfileSchema.nullable() })

/** The extension answers from local storage: a short wait is enough. */
export const PENDING_TIMEOUT_MS = 5000

const ask = (runtime: Runtime, extensionId: string, message: unknown, timeoutMs: number): Promise<{ readonly answered: boolean; readonly response?: unknown }> =>
  new Promise((resolve) => {
    if (!runtime || extensionId === '') return resolve({ answered: false })
    const timer = setTimeout(() => resolve({ answered: true }), timeoutMs)
    try {
      runtime.sendMessage(extensionId, message, (response) => {
        clearTimeout(timer)
        resolve(runtime.lastError ? { answered: false } : { answered: true, response })
      })
    } catch {
      clearTimeout(timer)
      resolve({ answered: false })
    }
  })

/** Tells the extension this Candydati is open here. Never throws; nothing happens without the extension. */
export const helloExtension = async (runtime: Runtime, extensionId: string): Promise<void> => {
  await ask(runtime, extensionId, { type: 'candydati.hello' }, PENDING_TIMEOUT_MS)
}

/** The profile waiting to be saved (null when there is none or it expired). Never throws. */
export const takePendingProfile = async (runtime: Runtime, extensionId: string, timeoutMs = PENDING_TIMEOUT_MS): Promise<PendingProfileAnswer> => {
  const { answered, response } = await ask(runtime, extensionId, { type: 'candydati.pending_profile' }, timeoutMs)
  if (!answered) return { ok: false, error: 'extension_missing' }
  const parsed = pendingSchema.safeParse(response)
  return parsed.success ? { ok: true, profile: parsed.data.profile } : { ok: false, error: 'failed' }
}
