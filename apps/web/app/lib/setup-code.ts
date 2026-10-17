/**
 * The first owner's setup code comes only with the link the api logs (`/signup?setup#code=...`): the page reads it
 * from the fragment, which no server receives, and keeps it in this tab's sessionStorage so a reload does not lose it.
 * Nobody ever types or sees it. Storage can be unavailable (private mode, blocked): then the fragment is the only source.
 */
const KEY = 'candydati.setup-code'

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** The code of the link (`#code=`), kept for this tab; else the one kept before; else ''. */
export const takeSetupCode = (hash: string): string => {
  const fromLink = new URLSearchParams(hash.replace(/^#/, '')).get('code')?.trim() ?? ''
  const kept = storage()
  try {
    if (fromLink !== '') kept?.setItem(KEY, fromLink)
    return fromLink !== '' ? fromLink : (kept?.getItem(KEY) ?? '')
  } catch {
    return fromLink
  }
}

/** Once the first account exists the code opens nothing: drop it. */
export const forgetSetupCode = (): void => {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // Storage unavailable: nothing was kept.
  }
}
