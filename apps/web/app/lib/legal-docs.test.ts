import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENTS, legalDocLink, providerKey } from './legal-docs'

describe('legal documents', () => {
  it('lists the templates of docs/legal as repository paths', () => {
    expect(LEGAL_DOCUMENTS.map((doc) => doc.path)).toEqual(['docs/legal/README.md', 'docs/legal/registro-trattamenti.md', 'docs/legal/dpa.md', 'docs/legal/sub-responsabili.md', 'docs/legal/informativa-candidati.md'])
  })

  it('links to the configured source, and only to a real http(s) address', () => {
    expect(legalDocLink('docs/legal/dpa.md', 'https://git.example.com/acme/ats/blob/main/')).toBe('https://git.example.com/acme/ats/blob/main/docs/legal/dpa.md')
    expect(legalDocLink('docs/legal/dpa.md', '')).toBeNull()
    expect(legalDocLink('docs/legal/dpa.md', '  ')).toBeNull()
    expect(legalDocLink('docs/legal/dpa.md', undefined)).toBeNull()
    expect(legalDocLink('docs/legal/dpa.md', 'javascript:alert(1)')).toBeNull()
    expect(legalDocLink('docs/legal/dpa.md', 'not a url')).toBeNull()
  })

  it('names known provider categories and keeps the others readable', () => {
    expect(providerKey('model')).toBe('privacyDocs.providers.model')
    expect(providerKey('crm')).toBeNull()
  })
})
