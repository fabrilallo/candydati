import { describe, expect, it } from 'vitest'
import {
  confirmNameMatches,
  correctionChanges,
  exportState,
  hasPreparing,
  retentionDaysLeft,
  retentionNotice,
  sortUpcoming,
  validateCorrection,
  withdrawConsequence,
  type CorrectionForm,
} from './gdpr-view'

const NOW = new Date('2026-10-13T10:00:00.000Z')
const TZ = 'Europe/Rome'

describe('retentionDaysLeft', () => {
  it('counts calendar days and says today or expired plainly', () => {
    expect(retentionDaysLeft('2026-10-25T08:00:00.000Z', NOW, TZ)).toEqual({ key: 'gdpr.daysLeft.in', count: 12, tone: 'warning' })
    expect(retentionDaysLeft('2026-10-13T20:00:00.000Z', NOW, TZ)).toEqual({ key: 'gdpr.daysLeft.today', count: 0, tone: 'warning' })
    expect(retentionDaysLeft('2026-10-10T08:00:00.000Z', NOW, TZ)).toEqual({ key: 'gdpr.daysLeft.expired', count: 3, tone: 'destructive' })
    expect(retentionDaysLeft('2027-10-13T10:00:00.000Z', NOW, TZ)).toEqual({ key: 'gdpr.daysLeft.in', count: 365, tone: 'neutral' })
  })

  it('returns null for an unreadable date', () => {
    expect(retentionDaysLeft('nope', NOW)).toBeNull()
  })
})

describe('confirmNameMatches', () => {
  it('accepts the full name ignoring case and extra spaces', () => {
    expect(confirmNameMatches('  marta   VERDI ', 'Marta Verdi')).toBe(true)
    expect(confirmNameMatches('Marta Verdi', 'Marta Verdi')).toBe(true)
  })

  it('refuses a partial or empty name', () => {
    expect(confirmNameMatches('Marta', 'Marta Verdi')).toBe(false)
    expect(confirmNameMatches('', 'Marta Verdi')).toBe(false)
    expect(confirmNameMatches('', '')).toBe(false)
    expect(confirmNameMatches('Marta Verdì', 'Marta Verdi')).toBe(false)
  })
})

describe('withdrawConsequence', () => {
  it('talent pool: the data stay only for this selection, nothing is erased', () => {
    expect(withdrawConsequence('talent_pool', 2)).toEqual({ key: 'gdpr.withdraw.consequence.talent_pool', erases: false, erasesCandidate: false })
  })

  it('selection: the application is erased, and the profile too when it is the last one', () => {
    expect(withdrawConsequence('selection', 2)).toEqual({ key: 'gdpr.withdraw.consequence.selection', erases: true, erasesCandidate: false })
    expect(withdrawConsequence('selection', 1)).toEqual({ key: 'gdpr.withdraw.consequence.selectionLast', erases: true, erasesCandidate: true })
  })
})

describe('exportState', () => {
  const base = { id: 'e1', sizeBytes: null, createdAt: '2026-10-13T09:00:00.000Z', completedAt: null, expiresAt: '2026-10-20T09:00:00.000Z' }

  it('maps the api status to preparing, ready, expired or failed', () => {
    expect(exportState({ ...base, status: 'pending' }, NOW)).toEqual({ state: 'preparing', key: 'dataExport.status.preparing', tone: 'secondary' })
    expect(exportState({ ...base, status: 'ready', expiresAt: '2026-10-20T09:00:00.000Z' }, NOW)).toEqual({ state: 'ready', key: 'dataExport.status.ready', tone: 'success' })
    expect(exportState({ ...base, status: 'failed' }, NOW)).toEqual({ state: 'failed', key: 'dataExport.status.failed', tone: 'destructive' })
    expect(exportState({ ...base, status: 'ready' }, NOW).state).toBe('ready')
  })

  it('a ready export past its expiry reads as expired, even before the api says so', () => {
    expect(exportState({ ...base, status: 'ready', expiresAt: '2026-10-12T09:00:00.000Z' }, NOW)).toEqual({ state: 'expired', key: 'dataExport.status.expired', tone: 'outline' })
  })

  it('polls only while something is being prepared', () => {
    expect(hasPreparing([{ ...base, status: 'ready', expiresAt: '2026-10-20T09:00:00.000Z' }], NOW)).toBe(false)
    expect(hasPreparing([{ ...base, status: 'pending' }], NOW)).toBe(true)
  })
})

describe('retentionNotice', () => {
  it('names the person and the days left', () => {
    expect(retentionNotice({ candidateName: 'Marta Verdi', expiresAt: '2026-10-25T08:00:00.000Z' }, NOW, TZ)).toEqual({ key: 'notifications.retention.named', params: { name: 'Marta Verdi', count: 12 }, count: 12 })
    expect(retentionNotice({ candidateName: 'Marta Verdi', expiresAt: '2026-10-13T20:00:00.000Z' }, NOW, TZ)).toEqual({ key: 'notifications.retention.namedToday', params: { name: 'Marta Verdi' }, count: 0 })
  })

  it('stays honest without a name or a date', () => {
    expect(retentionNotice({ candidateName: null, expiresAt: '2026-10-25T08:00:00.000Z' }, NOW, TZ)).toEqual({ key: 'notifications.retention.anonymous', params: { count: 12 }, count: 12 })
    expect(retentionNotice({ candidateName: 'Marta Verdi', expiresAt: null }, NOW, TZ)).toEqual({ key: 'notifications.retention.namedSoon', params: { name: 'Marta Verdi' }, count: 0 })
    expect(retentionNotice({ candidateName: null, expiresAt: null }, NOW, TZ)).toEqual({ key: 'notifications.retention.anonymousSoon', params: {}, count: 0 })
    expect(retentionNotice({ candidateName: null, expiresAt: '2026-10-10T08:00:00.000Z' }, NOW, TZ).key).toBe('notifications.retention.anonymousToday')
  })
})

describe('correction', () => {
  const current = { firstName: 'Marta', lastName: 'Verdi', email: 'marta@example.com', phone: null, linkedinUrl: 'https://www.linkedin.com/in/marta' }
  const form = (overrides: Partial<CorrectionForm> = {}): CorrectionForm => ({ firstName: 'Marta', lastName: 'Verdi', email: 'marta@example.com', phone: '', linkedinUrl: 'https://www.linkedin.com/in/marta', ...overrides })

  it('sends only what changed, with blanks as null', () => {
    expect(correctionChanges(current, form())).toEqual({})
    expect(correctionChanges(current, form({ email: ' Marta.V@example.com ', phone: ' +39 333 1 ', linkedinUrl: '' }))).toEqual({ email: 'Marta.V@example.com', phone: '+39 333 1', linkedinUrl: null })
    expect(correctionChanges(current, form({ firstName: ' Martina ' }))).toEqual({ firstName: 'Martina' })
  })

  it('validates names, email and the LinkedIn address', () => {
    expect(validateCorrection(form())).toEqual({})
    expect(validateCorrection(form({ firstName: ' ', email: 'nope', linkedinUrl: 'linkedin' }))).toEqual({
      firstName: 'gdpr.correct.errors.required',
      email: 'gdpr.correct.errors.email',
      linkedinUrl: 'gdpr.correct.errors.url',
    })
    expect(validateCorrection(form({ lastName: 'x'.repeat(121), phone: 'abc' }))).toEqual({ lastName: 'gdpr.correct.errors.tooLong', phone: 'gdpr.correct.errors.phone' })
    expect(validateCorrection(form({ phone: '+39 (02) 1234-567' }))).toEqual({})
    expect(validateCorrection(form({ email: ' ', lastName: '' }))).toEqual({ email: 'gdpr.correct.errors.required', lastName: 'gdpr.correct.errors.required' })
    expect(validateCorrection(form({ linkedinUrl: 'ftp://example.com' }))).toEqual({ linkedinUrl: 'gdpr.correct.errors.url' })
  })
})

describe('sortUpcoming', () => {
  it('soonest first, without touching the input', () => {
    const items = [
      { applicationId: 'a2', candidateId: 'c2', jobTitle: 'B', candidateName: 'Bianca', retentionExpiresAt: '2026-11-01T00:00:00.000Z' },
      { applicationId: 'a1', candidateId: 'c1', jobTitle: 'A', candidateName: 'Anna', retentionExpiresAt: '2026-10-20T00:00:00.000Z' },
    ]
    expect(sortUpcoming(items).map((item) => item.applicationId)).toEqual(['a1', 'a2'])
    expect(items[0]?.applicationId).toBe('a2')
  })
})
