import type { ProcessingRecordDto } from '@candydati/domain'
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

export interface ProviderRow {
  /** Translation key of the category. */
  readonly key: string
  readonly name: string
}

/** Pure: the providers the instance is configured with (the model only when `AGENT_MODEL` is set). */
export const providerRows = (providers: ProcessingRecordDto['providers']): readonly ProviderRow[] => [
  { key: 'privacyDocs.providers.storage', name: providers.storage },
  { key: 'privacyDocs.providers.email', name: providers.email },
  ...(providers.model === null ? [] : [{ key: 'privacyDocs.providers.model', name: providers.model }]),
]
