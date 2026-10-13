import { describe, expect, it } from 'vitest'
import { jobRequestSchema } from './phase9-contract'
import { jobRequestAction, canDecide, canConvert, newestFirst, requestBudget, requestStatusTone, requestSummary, requestsEmptyKey } from './job-request-view'
import { jobRequest } from '../../test/fixtures/job-request-fixtures'

const dto = (over: Record<string, unknown> = {}) => jobRequestSchema.parse(jobRequest('r1', over))

describe('job request view', () => {
  it('gives each status a tone', () => {
    expect(requestStatusTone('submitted')).toBe('warning')
    expect(requestStatusTone('approved')).toBe('success')
    expect(requestStatusTone('rejected')).toBe('destructive')
    expect(requestStatusTone('converted')).toBe('secondary')
  })

  it('lets only approvers decide on a submitted request', () => {
    expect(canDecide('owner', dto())).toBe(true)
    expect(canDecide('admin', dto())).toBe(true)
    expect(canDecide('recruiter', dto())).toBe(false)
    expect(canDecide(null, dto())).toBe(false)
    expect(canDecide('owner', dto({ status: 'approved' }))).toBe(false)
  })

  it('lets whoever can create jobs convert an approved request', () => {
    expect(canConvert('recruiter', dto({ status: 'approved' }))).toBe(true)
    expect(canConvert('hiring_manager', dto({ status: 'approved' }))).toBe(true)
    expect(canConvert('interviewer', dto({ status: 'approved' }))).toBe(false)
    expect(canConvert('recruiter', dto())).toBe(false)
    expect(canConvert('recruiter', dto({ status: 'converted' }))).toBe(false)
  })

  it('shows the action that fits the status and the role', () => {
    expect(jobRequestAction('admin', dto())).toBe('decide')
    expect(jobRequestAction('recruiter', dto())).toBe('wait')
    expect(jobRequestAction('recruiter', dto({ status: 'approved' }))).toBe('convert')
    expect(jobRequestAction('interviewer', dto({ status: 'approved' }))).toBe('wait')
    expect(jobRequestAction('recruiter', dto({ status: 'converted', jobId: 'j1' }))).toBe('open_job')
    expect(jobRequestAction('recruiter', dto({ status: 'converted' }))).toBe('none')
    expect(jobRequestAction('recruiter', dto({ status: 'rejected' }))).toBe('none')
  })

  it('sorts newest first without touching the input', () => {
    const list = [dto({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z' }), dto({ id: 'b', createdAt: '2026-10-05T00:00:00.000Z' })]
    expect(newestFirst(list).map((r) => r.id)).toEqual(['b', 'a'])
    expect(list.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('formats the budget', () => {
    expect(requestBudget(dto(), 'it')).toMatch(/45\.000.*60\.000/)
    expect(requestBudget(dto({ salaryMin: null, salaryMax: null }), 'it')).toBe('')
    expect(requestBudget(dto({ salaryMin: 50000, salaryMax: null }), 'it')).toMatch(/50\.000/)
  })

  it('picks the empty state by what the person can do', () => {
    expect(requestsEmptyKey('hiring_manager')).toBe('jobRequests.list.emptyCreate')
    expect(requestsEmptyKey('owner')).toBe('jobRequests.list.emptyCreate')
    expect(requestsEmptyKey('interviewer')).toBe('jobRequests.list.emptyReadOnly')
  })

  it('summarizes only what was filled in, for the assistant', () => {
    const tr = (key: string, params?: Record<string, unknown>) => (params ? `${key}=${String(params.label)}|${String(params.value)}` : key)
    const text = requestSummary(dto({ location: null, desiredStart: null, processNotes: null, interviewersNotes: null }), tr, 'it')
    expect(text.split('\n').map((line) => line.slice(0, 40))).toHaveLength(6)
    expect(text).toContain('jobRequests.fields.title|Backend developer')
    expect(text).toContain('jobRequests.fields.role|taxonomy.roles.backend_developer')
    expect(text).not.toContain('location')
  })
})
