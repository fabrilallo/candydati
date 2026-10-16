import { TAG_MAX, TAGS_PER_CANDIDATE_MAX } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { detail, T0 } from '~~/test/fixtures/candidate-fixtures'
import { addTag, applicationStatus, currentApplication, fullName, normalizeTag, removeTag, retentionState, stageOf } from './candidate-view'
import { extractionView } from './extraction-view'

describe('names and tags', () => {
  it('joins first and last name', () => {
    expect(fullName({ firstName: ' Giulia', lastName: 'Rossi ' })).toBe('Giulia Rossi')
  })

  it('normalizes a tag and refuses empty or too long ones', () => {
    expect(normalizeTag('  Go   Lang ')).toBe('go lang')
    expect(normalizeTag('   ')).toBeNull()
    expect(normalizeTag('x'.repeat(TAG_MAX + 1))).toBeNull()
  })

  it('adds a tag once, keeps the limit and removes without mutating', () => {
    const tags = ['go']
    expect(addTag(tags, 'Rust')).toEqual(['go', 'rust'])
    expect(addTag(tags, 'GO')).toBe(tags)
    expect(addTag(tags, ' ')).toBe(tags)
    const full = Array.from({ length: TAGS_PER_CANDIDATE_MAX }, (_, index) => `t${index}`)
    expect(addTag(full, 'new')).toBe(full)
    expect(removeTag(tags, 'go')).toEqual([])
    expect(tags).toEqual(['go'])
  })
})

describe('applications', () => {
  it('picks the most recent open application, else the most recent one', () => {
    const value = detail()
    const base = value.applications[0]!
    const older = { ...base, id: 'old', createdAt: '2025-01-01T00:00:00.000Z' }
    const newerClosed = { ...base, id: 'closed', createdAt: '2026-12-01T00:00:00.000Z', outcome: 'withdrawn' as const }
    expect(currentApplication([older, base, newerClosed])?.id).toBe('a1')
    expect(currentApplication([newerClosed, { ...older, outcome: 'hired' as const }])?.id).toBe('closed')
    expect(currentApplication([])).toBeNull()
  })

  it('names the stage and the status', () => {
    const app = detail().applications[0]!
    expect(stageOf(app)?.declared?.type).toBe('screening_call')
    expect(stageOf({ ...app, stageId: 'gone' })).toBeNull()
    expect(applicationStatus(app)).toEqual({ key: 'candidate.status.open', tone: 'secondary' })
    expect(applicationStatus({ ...app, outcome: 'hired' })).toEqual({ key: 'candidate.outcomes.hired', tone: 'success' })
    expect(applicationStatus({ ...app, outcome: 'not_selected' })).toEqual({ key: 'candidate.outcomes.not_selected', tone: 'outline' })
  })

  it('flags a retention expiry that is close or past', () => {
    const now = new Date(T0)
    expect(retentionState('2027-10-13T10:00:00.000Z', now)).toBe('ok')
    expect(retentionState('2026-10-30T10:00:00.000Z', now)).toBe('soon')
    expect(retentionState('2026-10-01T10:00:00.000Z', now)).toBe('expired')
    expect(retentionState('nope', now)).toBe('ok')
  })
})

describe('extractionView', () => {
  it('shows the extracted data with its source', () => {
    const view = extractionView(detail().applications[0]!.extraction)
    expect(view.kind).toBe('done')
    expect(view.kind === 'done' && view.data.skills).toEqual(['TypeScript', 'Postgres'])
    expect(view.kind === 'done' && view.source).toBe('model')
  })

  it('handles every other state', () => {
    expect(extractionView(null)).toEqual({ kind: 'pending' })
    expect(extractionView({ status: 'pending', data: null, source: null })).toEqual({ kind: 'pending' })
    expect(extractionView({ status: 'text_only', data: null, source: 'text' })).toEqual({ kind: 'text_only' })
    expect(extractionView({ status: 'failed', data: null, source: null })).toEqual({ kind: 'failed' })
    expect(extractionView({ status: 'done', data: null, source: 'model' })).toEqual({ kind: 'failed' })
  })

  it('treats a done extraction with nothing in it as empty', () => {
    const empty = { experiences: [], education: [], skills: [], languages: [] }
    expect(extractionView({ status: 'done', data: empty, source: 'model' })).toEqual({ kind: 'empty' })
  })
})
