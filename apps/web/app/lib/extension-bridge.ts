import { linkedinProfileSchema, type LinkedinProfile } from '@candydati/domain'
import { z } from 'zod'

/**
 * The page talks to the Candydati extension with `chrome.runtime.sendMessage(extensionId, …)` (the extension lists the
 * app's origin in `externally_connectable`). The extension answers with what it read in the recruiter's own browser.
 */
export interface LinkedinSearchRequest {
  readonly type: 'candydati.search_linkedin'
  readonly keywords: readonly string[]
  readonly location: string | null
  readonly limit: number
}

export const EXTENSION_ERRORS = ['extension_missing', 'not_logged_in', 'captcha', 'cancelled', 'linkedin_changed', 'failed'] as const
export type ExtensionError = (typeof EXTENSION_ERRORS)[number]

const answerSchema = z.union([
  z.object({ ok: z.literal(true), profiles: z.array(linkedinProfileSchema).max(100) }),
  z.object({ ok: z.literal(false), error: z.enum(EXTENSION_ERRORS) }),
])

export type LinkedinSearchAnswer = { readonly ok: true; readonly profiles: readonly LinkedinProfile[] } | { readonly ok: false; readonly error: ExtensionError }

interface ChromeRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (response: unknown) => void): void
  readonly lastError?: { readonly message?: string } | undefined
}

/** The extension's messaging API, when the page runs in Chrome; null elsewhere (another browser, no extension API). */
export const chromeRuntime = (): ChromeRuntime | null => {
  const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime
  return runtime && typeof runtime.sendMessage === 'function' ? runtime : null
}

/** Searching and reading profiles takes time (a page per profile): a generous ceiling, then "failed". */
export const EXTENSION_TIMEOUT_MS = 15 * 60_000

/**
 * Asks the extension to search LinkedIn. Never throws: a missing extension, a timeout or an answer of the wrong shape
 * become an error the assistant can explain.
 */
export const searchLinkedinWithExtension = (runtime: ChromeRuntime | null, extensionId: string, request: LinkedinSearchRequest, timeoutMs = EXTENSION_TIMEOUT_MS): Promise<LinkedinSearchAnswer> =>
  new Promise((resolve) => {
    if (!runtime || extensionId === '') return resolve({ ok: false, error: 'extension_missing' })
    const timer = setTimeout(() => resolve({ ok: false, error: 'failed' }), timeoutMs)
    try {
      runtime.sendMessage(extensionId, request, (response) => {
        clearTimeout(timer)
        if (runtime.lastError) return resolve({ ok: false, error: 'extension_missing' })
        const parsed = answerSchema.safeParse(response)
        resolve(parsed.success ? parsed.data : { ok: false, error: 'failed' })
      })
    } catch {
      clearTimeout(timer)
      resolve({ ok: false, error: 'extension_missing' })
    }
  })
