import type { JobSummaryDto } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { jobFacts, readinessOf, relativeTime } from './job-list-view'

const base: JobSummaryDto = {
  id: 'j1',
  slug: 'j1',
  status: 'draft',
  title: 'Backend developer',
  role: 'backend_developer',
  customRole: null,
  publishable: false,
  publishIssueCount: 3,
  salary: { currency: 'EUR', period: 'year' },
  workMode: null,
  qualityTotal: null,
  belowThreshold: false,
  updatedAt: '2026-10-13T10:00:00.000Z',
  publishedAt: null,
}

describe('readinessOf', () => {
  it('counts what is missing on a draft', () => {
    expect(readinessOf(base)).toEqual({ kind: 'missing', count: 3 })
    expect(readinessOf({ ...base, publishIssueCount: 1 })).toEqual({ kind: 'missing', count: 1 })
  })

  it('says ready when a draft has everything', () => {
    expect(readinessOf({ ...base, publishable: true, publishIssueCount: 0 })).toEqual({ kind: 'ready' })
  })

  it('has no readiness for published or closed ads', () => {
    expect(readinessOf({ ...base, status: 'published' })).toBeNull()
    expect(readinessOf({ ...base, status: 'closed' })).toBeNull()
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-10-13T12:00:00.000Z')
  it.each([
    ['2026-10-13T11:59:40.000Z', 'it', 'ora'],
    ['2026-10-13T11:15:00.000Z', 'it', '45 minuti fa'],
    ['2026-10-13T07:00:00.000Z', 'it', '5 ore fa'],
    ['2026-10-12T10:00:00.000Z', 'it', 'ieri'],
    ['2026-10-08T12:00:00.000Z', 'it', '5 giorni fa'],
    ['2026-09-20T12:00:00.000Z', 'it', '3 settimane fa'],
    ['2026-07-13T12:00:00.000Z', 'it', '3 mesi fa'],
    ['2024-10-13T12:00:00.000Z', 'it', '2 anni fa'],
    ['2026-10-12T10:00:00.000Z', 'en', 'yesterday'],
  ])('%s in %s is %s', (iso, locale, expected) => {
    expect(relativeTime(iso, now, locale)).toBe(expected)
  })

  it('never goes into the future and survives garbage', () => {
    expect(relativeTime('2026-10-14T12:00:00.000Z', now, 'it')).toBe('ora')
    expect(relativeTime('not a date', now, 'it')).toBe('')
  })
})

describe('jobFacts', () => {
  it('lists role and work mode keys, skipping what is not set', () => {
    expect(jobFacts(base)).toEqual({ roleKey: 'taxonomy.roles.backend_developer', roleText: null, workModeKey: null })
    expect(jobFacts({ ...base, role: null, workMode: 'remote' })).toEqual({ roleKey: null, roleText: null, workModeKey: 'taxonomy.workModes.remote' })
  })

  it('carries the text of a custom role instead of a taxonomy key', () => {
    expect(jobFacts({ ...base, role: 'other', customRole: 'Pastry chef' })).toMatchObject({ roleKey: null, roleText: 'Pastry chef' })
  })
})
