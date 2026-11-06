import { describe, expect, it } from 'vitest'
import { sourcedContactInputSchema } from '@candydati/domain'
import { contactFromProfile } from './linkedin-save-view'

const PROFILE = { profileUrl: 'https://www.linkedin.com/in/giulia-verdi/', fullName: 'Giulia Verdi', headline: ' Backend engineer at Acme ', location: 'Torino, Piemonte, Italia', text: '' }

describe('contact from a saved LinkedIn profile', () => {
  it('splits the name and keeps headline, location, link and the typed evidence', () => {
    const input = contactFromProfile(PROFILE, 'Go: 4 anni in Acme\n\nvive a Torino')
    expect(input).toEqual({
      firstName: 'Giulia',
      lastName: 'Verdi',
      headline: 'Backend engineer at Acme',
      location: 'Torino, Piemonte, Italia',
      source: 'linkedin',
      profileUrl: 'https://www.linkedin.com/in/giulia-verdi/',
      evidence: [{ criterion: 'Go', text: '4 anni in Acme' }, { criterion: 'Note', text: 'vive a Torino' }],
    })
    expect(sourcedContactInputSchema.safeParse(input).success).toBe(true)
  })

  it('handles a single name, empty fields and texts longer than a contact takes', () => {
    const input = contactFromProfile({ ...PROFILE, fullName: 'Giulia', headline: 'x'.repeat(300), location: '  ' }, '')
    expect(input).toMatchObject({ firstName: 'Giulia', lastName: null, location: null, evidence: [] })
    expect(input.headline).toHaveLength(200)
    expect(sourcedContactInputSchema.safeParse(input).success).toBe(true)
  })
})
