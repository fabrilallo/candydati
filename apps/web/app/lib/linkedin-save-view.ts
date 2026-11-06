import { splitFullName, type LinkedinProfile, type SourcedContactInput } from '@candydati/domain'
import { parseEvidence } from './sourcing-view'

/** The limits of `sourcedContactInputSchema`: what LinkedIn shows may be longer. */
const NAME_MAX = 80
const HEADLINE_MAX = 200
const LOCATION_MAX = 120

const cut = (value: string | null, max: number): string | null => {
  const trimmed = value?.trim().slice(0, max).trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/**
 * Pure: the contact made from the profile saved with the extension. The name is split as the import does it ("Maria
 * Grazia De Luca"); the evidence is what the person typed, one "criterion: fact" per line. Nothing else of the page.
 */
export const contactFromProfile = (profile: LinkedinProfile, evidence: string): SourcedContactInput => {
  const name = splitFullName(profile.fullName)
  return {
    firstName: cut(name.firstName, NAME_MAX) ?? profile.fullName.trim().slice(0, NAME_MAX),
    lastName: cut(name.lastName, NAME_MAX),
    headline: cut(profile.headline, HEADLINE_MAX),
    location: cut(profile.location, LOCATION_MAX),
    source: 'linkedin',
    profileUrl: profile.profileUrl,
    evidence: [...parseEvidence(evidence)],
  }
}
