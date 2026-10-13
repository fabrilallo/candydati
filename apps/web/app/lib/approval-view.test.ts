import { describe, expect, it } from 'vitest'
import { approvalErrorKey, approvalRequestPath, approvalState, getJobApproval, requestJobApproval } from './approval-view'
import type { JobApiRequest } from './job-api'

const approval = { approvedBy: 'u1', approvedAt: '2026-10-10T09:00:00.000Z', salaryMin: 40000, salaryMax: 50000, currency: 'EUR' as const }
const form = (salaryMin: string, salaryMax: string, currency = 'EUR', period = 'year') => ({ salaryMin, salaryMax, currency, period })

describe('approval of an ad', () => {
  it('is off when the organization does not ask for it, or while the setting is unknown', () => {
    expect(approvalState(false, null, form('', ''))).toBe('off')
    expect(approvalState(null, null, form('', ''))).toBe('off')
  })

  it('is missing, approved, or exceeded by the salary in the form (the domain rule decides)', () => {
    expect(approvalState(true, null, form('40000', '50000'))).toBe('missing')
    expect(approvalState(true, approval, form('40000', '50000'))).toBe('approved')
    expect(approvalState(true, approval, form('', ''))).toBe('approved')
    expect(approvalState(true, approval, form('40000', '55000'))).toBe('exceeded')
    // A lower range stays inside the budget: the editor agrees with what publish accepts.
    expect(approvalState(true, approval, form('38000', '50000'))).toBe('approved')
    // Another currency is beyond the approval, and a monthly pay is compared by year.
    expect(approvalState(true, approval, form('40000', '50000', 'USD'))).toBe('exceeded')
    expect(approvalState(true, approval, form('3000', '4000', 'EUR', 'month'))).toBe('approved')
    expect(approvalState(true, approval, form('9000', '10000', 'EUR', 'month'))).toBe('exceeded')
  })

  it('explains the publish refusals, by code or by issue message', () => {
    expect(approvalErrorKey('approval_required')).toBe('job.approval.errors.required')
    expect(approvalErrorKey('validation_failed', ['approval_range_exceeded'])).toBe('job.approval.errors.rangeExceeded')
    expect(approvalErrorKey('conflict')).toBeNull()
    expect(approvalErrorKey(null)).toBeNull()
  })

  it('links the request form with the title of the ad', () => {
    expect(approvalRequestPath(' Data Engineer ')).toBe('/app/job-requests/new?title=Data%20Engineer')
    expect(approvalRequestPath('')).toBe('/app/job-requests/new')
  })
})

describe('approval api', () => {
  it('reads the status of a job and asks for approval with a reason', async () => {
    const calls: unknown[] = []
    const request: JobApiRequest = async (url, init) => {
      calls.push({ url, init })
      return { status: 200, body: { success: true, data: { requireApproval: true, approval, publishable: true } } }
    }
    const status = await getJobApproval(request, 'j1')
    expect(status.approval?.approvedBy).toBe('u1')
    await requestJobApproval(request, 'j1', ' Serve entro gennaio ')
    expect(calls).toEqual([
      { url: '/api/v1/jobs/j1/approval', init: undefined },
      { url: '/api/v1/jobs/j1/approval-request', init: { method: 'POST', body: { reason: 'Serve entro gennaio' } } },
    ])
  })
})
