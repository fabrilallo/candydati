import { MIGRATION_FETCH_ERRORS } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { ApiFailure } from './api-call'
import { commitErrorKey, failureKey, isWorking, issueTotals, jobViews, migrationTone, previewFigures, stageNameGroups, stageTargetKey, stepOf, unmappedCount } from './migration-view'

const job = (jobRef: string, applications = 2) => ({ jobRef, title: jobRef, status: 'closed' as const, stages: 2, applications, open: 0, hired: 1, notSelected: 1, withdrawn: 0 })
const entry = (jobRef: string, stageRef: string, sourceName: string, type: string) => ({ jobRef, stageRef, sourceName, title: sourceName, type }) as never
type Batch = Parameters<typeof previewFigures>[0] & Parameters<typeof unmappedCount>[0]
const batch = (over: Record<string, unknown> = {}): Batch =>
  ({
    counts: { jobs: 2, candidates: 5, applications: 4, notes: 1, messages: 2, files: 3, perJob: [job('j1'), job('j2', 3)], issueErrors: 0, issueWarnings: 2, issueInfos: 1 },
    stageMapping: [entry('j1', 's1', 'Applied', 'other'), entry('j1', 's2', 'Colloquio HR', 'hr_interview'), entry('j2', 't1', 'applied', 'other'), entry('j2', 't2', 'Offer', 'offer')],
    excludedJobs: [],
    status: 'ready',
    ...over,
  }) as unknown as Batch

describe('migration view', () => {
  it('follows the status to a wizard step', () => {
    expect(stepOf({ status: 'analyzing', counts: {} })).toBe('analysis')
    expect(stepOf({ status: 'ready', counts: {} })).toBe('preview')
    expect(stepOf({ status: 'importing', counts: {} })).toBe('result')
    expect(stepOf({ status: 'failed', counts: {} })).toBe('analysis')
    expect(stepOf({ status: 'failed', counts: { commit: {} as never } })).toBe('result')
  })

  it('polls only while the worker is on it', () => {
    expect(['uploaded', 'fetching', 'analyzing', 'importing'].every((status) => isWorking(status as never))).toBe(true)
    expect(['ready', 'done', 'failed', 'undone'].some((status) => isWorking(status as never))).toBe(false)
  })

  it('tones: done is success, failed destructive, ready waits for you', () => {
    expect([migrationTone('done'), migrationTone('failed'), migrationTone('ready'), migrationTone('undone')]).toEqual(['success', 'destructive', 'default', 'outline'])
  })

  it('counts the stages still to choose, not those of left out jobs', () => {
    expect(unmappedCount(batch())).toBe(2)
    expect(unmappedCount(batch({ excludedJobs: ['j2'] }))).toBe(1)
  })

  it('groups the jobs with their stages and what is left to decide', () => {
    const views = jobViews(batch({ excludedJobs: ['j2'] }))
    expect(views.map((view) => [view.count.jobRef, view.excluded, view.stages.length, view.unmapped])).toEqual([['j1', false, 2, 1], ['j2', true, 2, 1]])
  })

  it('groups stage names across jobs like the server compares them', () => {
    const groups = stageNameGroups(batch().stageMapping)
    expect(groups.find((group) => group.key === 'applied')).toMatchObject({ name: 'Applied', jobs: 2, type: 'other' })
    expect(groups.find((group) => group.key === 'offer')?.type).toBe('offer')
    const mixed = stageNameGroups([entry('j1', 's1', 'Applied', 'other'), entry('j2', 't1', 'Applied', 'received')])
    expect(mixed[0]?.type).toBeNull()
  })

  it('headlines the figures of the jobs that stay', () => {
    expect(previewFigures(batch())).toMatchObject({ jobs: 2, jobsLeftOut: 0, applications: 5, candidates: 5 })
    expect(previewFigures(batch({ excludedJobs: ['j2'] }))).toMatchObject({ jobs: 1, jobsLeftOut: 1, applications: 2 })
  })

  it('totals the findings by level', () => {
    expect(issueTotals(batch().counts)).toEqual({ error: 0, warning: 2, info: 1 })
    expect(issueTotals({})).toEqual({ error: 0, warning: 0, info: 0 })
  })

  it('names the target of a stage', () => {
    expect(stageTargetKey('received')).toBe('pipeline.received')
    expect(stageTargetKey('other')).toBe('migrations.stages.other')
    expect(stageTargetKey('hr_interview')).toBe('taxonomy.stageTypes.hr_interview')
  })

  it('words the reason of a failure, with a generic one for codes it does not know', () => {
    expect(failureKey('missing_manifest')).toBe('migrations.failure.missing_manifest')
    expect(failureKey('something_new')).toBe('migrations.failure.unknown')
    expect(failureKey(null)).toBe('migrations.failure.unknown')
    for (const code of MIGRATION_FETCH_ERRORS) expect(failureKey(code)).toBe(`migrations.failure.${code}`)
  })

  it('reads a refused commit', () => {
    const refused = (message: string) => new ApiFailure('errors.generic', { status: 422, code: 'validation_failed', message: 'x', issues: [{ path: 'migration', message }] })
    expect(commitErrorKey(refused('stages_unmapped:3'))).toEqual({ key: 'migrations.errors.stagesUnmapped', count: 3 })
    expect(commitErrorKey(refused('privacy_notice_missing'))).toEqual({ key: 'migrations.errors.privacyNoticeMissing' })
    expect(commitErrorKey(refused('too_many_stages:j1'))).toEqual({ key: 'migrations.errors.tooManyStages' })
    expect(commitErrorKey(refused('other'))).toBeNull()
    expect(commitErrorKey(new Error('x'))).toBeNull()
  })
})
