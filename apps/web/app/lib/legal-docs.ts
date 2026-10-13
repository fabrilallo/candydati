/** The templates in the repository (`docs/legal/`), with the translation key of their one-line description. */
export const LEGAL_DOCUMENTS = [
  { path: 'docs/legal/README.md', key: 'readme' },
  { path: 'docs/legal/registro-trattamenti.md', key: 'register' },
  { path: 'docs/legal/dpa.md', key: 'dpa' },
  { path: 'docs/legal/sub-responsabili.md', key: 'subprocessors' },
  { path: 'docs/legal/informativa-candidati.md', key: 'notice' },
] as const

/**
 * Pure: the address of a template in the project's source, when the instance configures where the repository files
 * can be browsed (`NUXT_PUBLIC_SOURCE_URL`, e.g. `https://…/blob/main`). Without it, the path is shown as text: no
 * address is ever made up.
 */
export const legalDocLink = (path: string, sourceUrl: string | undefined): string | null => {
  const base = sourceUrl?.trim() ?? ''
  if (base === '') return null
  try {
    const url = new URL(`${base.replace(/\/+$/, '')}/${path}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

const PROVIDER_CATEGORIES: ReadonlySet<string> = new Set(['hosting', 'database', 'storage', 'email', 'model', 'monitoring'])

/** Pure: translation key of a provider category; null for one the web does not know (shown as sent). */
export const providerKey = (category: string): string | null => (PROVIDER_CATEGORIES.has(category) ? `privacyDocs.providers.${category}` : null)
