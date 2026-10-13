import { describe, expect, it } from 'vitest'
import { batchFigures, batchTone, isToRenew, renewalDeadline, consentRenewal, ignoredReasonKey, isWorking, progressPercent, sourceText, wizardStep } from './import-view'

describe('batch status', () => {
  it('gives each status a tone and the wizard step it resumes at', () => {
    expect(batchTone('done')).toBe('success')
    expect(batchTone('failed')).toBe('destructive')
    expect(batchTone('undone')).toBe('outline')
    expect(batchTone('analyzing')).toBe('secondary')
    expect(batchTone('ready')).toBe('default')
    expect(wizardStep('uploaded')).toBe('analysis')
    expect(wizardStep('analyzing')).toBe('analysis')
    expect(wizardStep('ready')).toBe('mapping')
    expect(wizardStep('importing')).toBe('result')
    expect(wizardStep('done')).toBe('result')
    expect(wizardStep('failed')).toBe('analysis')
  })

  it('polls only while the worker is busy', () => {
    expect(isWorking('uploaded')).toBe(true)
    expect(isWorking('analyzing')).toBe(true)
    expect(isWorking('importing')).toBe(true)
    expect(isWorking('ready')).toBe(false)
    expect(isWorking('done')).toBe(false)
  })

  it('turns progress into a bounded percentage, null when unknown', () => {
    expect(progressPercent({ done: 5, total: 20 })).toBe(25)
    expect(progressPercent({ done: 30, total: 20 })).toBe(100)
    expect(progressPercent({ done: 0, total: 0 })).toBeNull()
    expect(progressPercent(null)).toBeNull()
  })
})

describe('ignoredReasonKey', () => {
  it('maps the known reasons and falls back to "other"', () => {
    expect(ignoredReasonKey('unsupported_type')).toBe('imports.ignored.unsupported')
    expect(ignoredReasonKey('unreadable')).toBe('imports.ignored.unreadable')
    expect(ignoredReasonKey('something_new')).toBe('imports.ignored.other')
  })
})

describe('sourceText', () => {
  it('reads a file by name and a row by its number in the sheet', () => {
    const t = (key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params ?? {})}`
    expect(sourceText({ kind: 'file', name: 'cv/anna.pdf' }, t)).toBe('cv/anna.pdf')
    expect(sourceText({ kind: 'row', row: 0 }, t)).toBe('imports.preview.row:{"row":2}')
  })
})

describe('batchFigures', () => {
  it('splits imported into new and merged, and counts the excluded', () => {
    const counts = { files: 3, cvs: 2, rows: 5, items: 10, included: 8, imported: 8, merged: 3, failed: 0, noEmail: 1, emailsQueued: 7, skippedReconfirmed: 0, erased: 0, ignored: 0 }
    expect(batchFigures(counts)).toEqual({ created: 5, merged: 3, excluded: 2 })
  })
})

describe('consentRenewal', () => {
  const now = new Date('2026-10-13T10:00:00.000Z')

  it('is null for a candidate who gave consent', () => {
    expect(consentRenewal('given', '2026-10-20T10:00:00.000Z', now)).toBeNull()
  })

  it('counts whole days left, destructive on the last day', () => {
    expect(consentRenewal('to_renew', '2026-11-12T10:00:00.000Z', now)).toEqual({ days: 30, tone: 'warning' })
    expect(consentRenewal('to_renew', '2026-10-18T09:00:00.000Z', now)).toEqual({ days: 5, tone: 'warning' })
    expect(consentRenewal('to_renew', '2026-10-13T20:00:00.000Z', now)).toEqual({ days: 1, tone: 'destructive' })
    expect(consentRenewal('to_renew', '2026-10-12T20:00:00.000Z', now)).toEqual({ days: 0, tone: 'destructive' })
  })

  it('has no days without a date', () => {
    expect(consentRenewal('to_renew', null, now)).toEqual({ days: null, tone: 'warning' })
    expect(consentRenewal('to_renew', 'not a date', now)).toEqual({ days: null, tone: 'warning' })
  })
})

describe('renewal of a candidate', () => {
  const app = (status: 'given' | 'to_renew', at: string, onConsent = false) => ({
    consentStatus: onConsent ? ('given' as const) : status,
    consent: { status: onConsent ? status : ('given' as const) },
    retentionExpiresAt: at,
  })

  it('reads the status on the application or on its consent', () => {
    expect(isToRenew(app('to_renew', 'x'))).toBe(true)
    expect(isToRenew(app('to_renew', 'x', true))).toBe(true)
    expect(isToRenew(app('given', 'x'))).toBe(false)
  })

  it('takes the earliest deadline among the applications to renew', () => {
    expect(renewalDeadline([app('given', '2026-10-01T00:00:00.000Z'), app('to_renew', '2026-11-12T00:00:00.000Z'), app('to_renew', '2026-11-02T00:00:00.000Z', true)])).toBe('2026-11-02T00:00:00.000Z')
    expect(renewalDeadline([app('given', '2026-10-01T00:00:00.000Z')])).toBeNull()
  })
})
