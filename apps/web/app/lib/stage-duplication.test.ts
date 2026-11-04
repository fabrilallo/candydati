import { MAX_STAGES } from '@candydati/domain'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from './auth-errors'
import type { JobApiRequest } from './job-api'
import type { StageForm } from './job-form'
import { duplicateBlockOf, duplicateStageLocally, duplicationNotice, requestStageDuplicate } from './stage-duplication'

const NOW = '2026-10-13T10:00:00.000Z'
const content = { title: 'Dev', language: 'it', salary: { currency: 'EUR', period: 'year' }, location: {}, process: [], summary: '', responsibilities: [], requirements: { mustHave: [], niceToHave: [] }, technologies: [], benefits: [], growth: '', workLifeBalance: '', culture: '' }
const job = { id: 'j 1', slug: 'dev-abc', status: 'draft', content, quality: null, publishIssues: [], complianceWarnings: [], createdAt: NOW, updatedAt: NOW, publishedAt: null, closedAt: null }
const stage = (id: string, title: string): StageForm => ({ id, title, type: 'technical_interview', durationMinutes: '60', conductedBy: 'technical_lead', note: 'n' })
const t = (key: string, values?: Record<string, unknown>) => (values ? `${key}(${JSON.stringify(values)})` : key)

describe('requestStageDuplicate', () => {
  it('posts to the stage route with encoded ids and returns the validated result', async () => {
    const request = vi.fn<JobApiRequest>(async () => ({ status: 200, body: { success: true, data: { job, stageId: 'stg-new', copied: ['scorecard'], skipped: ['automations'] }, error: null } }))
    const result = await requestStageDuplicate(request, 'j 1', 'stg-a')
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j%201/stages/stg-a/duplicate', { method: 'POST', body: {} })
    expect(result).toMatchObject({ stageId: 'stg-new', copied: ['scorecard'], skipped: ['automations'], job: { id: 'j 1' } })
  })

  it('turns a refusal into an AppError', async () => {
    const request = vi.fn<JobApiRequest>(async () => ({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'x' } } }))
    await expect(requestStageDuplicate(request, 'j1', 'stg-a')).rejects.toBeInstanceOf(AppError)
  })
})

describe('duplicateStageLocally', () => {
  it('inserts a copy without id right after the stage, without touching the list', () => {
    const process = Object.freeze([stage('', 'One'), stage('stg-b', 'Two')])
    expect(duplicateStageLocally(process, 0).map((s) => [s.id, s.title])).toEqual([['', 'One'], ['', 'One'], ['stg-b', 'Two']])
    expect(duplicateStageLocally(process, 1)[2]).toEqual({ ...stage('stg-b', 'Two'), id: '' })
    expect(process).toHaveLength(2)
    expect(duplicateStageLocally(process, 5)).toBe(process)
  })
})

describe('duplicateBlockOf', () => {
  it('blocks at the maximum, and a saved stage while the form has unsaved changes', () => {
    expect(duplicateBlockOf({ count: MAX_STAGES, dirty: false })).toBe('max')
    expect(duplicateBlockOf({ count: 2, dirty: true })).toBe('saveFirst')
    expect(duplicateBlockOf({ count: 2, dirty: false })).toBeNull()
  })
})

describe('duplicationNotice', () => {
  it('names what came along and what was left out for permissions', () => {
    expect(duplicationNotice({ copied: ['interviewers', 'scorecard'], skipped: ['restriction'] }, t)).toEqual({
      title: 'job.editor.process.duplicated',
      description:
        'job.editor.process.duplicatedCopied({"list":"job.editor.process.duplicateKinds.interviewers, job.editor.process.duplicateKinds.scorecard"}) job.editor.process.duplicatedSkipped({"list":"job.editor.process.duplicateKinds.restriction"})',
    })
    expect(duplicationNotice({ copied: [], skipped: [] }, t)).toEqual({ title: 'job.editor.process.duplicated', description: undefined })
  })
})
