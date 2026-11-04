import type { ClientDto, PublicShortlistCandidateDto, PublicShortlistDto, ShortlistDto } from '@candydati/domain'

/** Clients of an agency and shortlists, as the api returns them. Invented companies and people only. */
const AT = '2026-10-13T10:00:00.000Z'

export const client = (overrides: Partial<ClientDto> = {}): ClientDto => ({
  id: 'c1',
  name: 'Acme Spa',
  website: 'https://acme.example',
  logoUrl: null,
  contacts: [{ id: 'k1', name: 'Rita Verdi', email: 'rita@acme.example' }],
  archived: false,
  jobCount: 2,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
})

export const shortlist = (overrides: Partial<ShortlistDto> = {}): ShortlistDto => ({
  id: 's1',
  jobId: 'j1',
  clientId: 'c1',
  clientName: 'Acme Spa',
  recipientName: 'Rita Verdi',
  recipientEmail: 'rita@acme.example',
  message: null,
  status: 'open',
  remindersSent: 0,
  firstOpenedAt: null,
  createdAt: AT,
  expiresAt: '2026-10-27T10:00:00.000Z',
  revokedAt: null,
  items: [
    { id: 'i1', applicationId: 'a1', candidateName: 'Giulia Rossi', shareCv: true, sharedNoteCount: 1, answer: 'meet', answerReason: 'Profilo solido', answeredAt: AT, candidateNotified: true },
    { id: 'i2', applicationId: 'a2', candidateName: 'Marco Bianchi', shareCv: false, sharedNoteCount: 0, answer: null, answerReason: null, answeredAt: null, candidateNotified: true },
  ],
  ...overrides,
})

export const publicCandidate = (itemId: string, overrides: Partial<PublicShortlistCandidateDto> = {}): PublicShortlistCandidateDto => ({
  itemId,
  firstName: 'Giulia',
  lastName: `Rossi ${itemId}`,
  hasCv: true,
  notes: [{ body: 'Molto chiara sulle aspettative.', at: AT }],
  answer: null,
  answerReason: null,
  answeredAt: null,
  ...overrides,
})

export const publicShortlist = (overrides: Partial<PublicShortlistDto> = {}): PublicShortlistDto => ({
  agencyName: 'Talenti Srl',
  clientName: 'Acme Spa',
  recipientName: 'Rita Verdi',
  jobTitle: 'Backend developer',
  language: 'it',
  message: 'Ecco i profili di cui abbiamo parlato.',
  expiresAt: '2026-10-27T10:00:00.000Z',
  candidates: [publicCandidate('i1'), publicCandidate('i2', { hasCv: false, notes: [] })],
  ...overrides,
})
