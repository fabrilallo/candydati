import { describe, expect, it, vi } from 'vitest'
import { reportsFixture } from '~~/test/fixtures/phase10-fixtures'
import { ApiFailure } from './api-call'
import type { JobApiRequest } from './job-api'
import { getReports, reportJobOptions, reportsCsvUrl } from './report-api'

const period = { from: '2026-09-14', to: '2026-10-13' }

describe('getReports', () => {
  it('asks for the period and job, and validates the answer', async () => {
    const request = vi.fn<JobApiRequest>().mockResolvedValue({ status: 200, body: { success: true, data: reportsFixture(), error: null } })
    const report = await getReports(request, period, 'j1')
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/reports?from=2026-09-14T00%3A00%3A00.000Z&to=2026-10-13T23%3A59%3A59.999Z&jobId=j1')
    expect(report.responses?.kept).toBe(47)
  })

  it('keeps the page when one section is invalid: that section is null, the others stay', async () => {
    const bad = { ...reportsFixture(), funnel: { ...reportsFixture().funnel, stages: [{ position: 0, stageId: 'received', title: null, type: 'received', entered: 3, conversionToNext: { count: 4, total: 3, rate: 1.3333 } }] } }
    const { outcomeCoverage: _dropped, ...partial } = bad
    const request = vi.fn<JobApiRequest>().mockResolvedValue({ status: 200, body: { success: true, data: partial, error: null } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = await getReports(request, period, null)
    error.mockRestore()
    expect(report.funnel).toBeNull()
    expect(report.outcomeCoverage).toBeNull()
    expect(report.sources).toEqual(reportsFixture().sources)
    expect(report.responses?.kept).toBe(47)
  })

  it('turns a denied request into a translated failure', async () => {
    const request = vi.fn<JobApiRequest>().mockResolvedValue({ status: 403, body: { success: false, data: null, error: { code: 'forbidden', message: 'no' } } })
    await expect(getReports(request, period, null)).rejects.toBeInstanceOf(ApiFailure)
  })
})

describe('reportsCsvUrl', () => {
  it('is the export of the same period and job', () => {
    expect(reportsCsvUrl(period, null)).toBe('/api/v1/reports/export.csv?from=2026-09-14T00%3A00%3A00.000Z&to=2026-10-13T23%3A59%3A59.999Z')
  })
})

describe('reportJobOptions', () => {
  it('keeps ads that can have applications, sorted by title', () => {
    const jobs = [
      { id: 'a', title: 'Zeta', status: 'published' as const },
      { id: 'b', title: 'Bozza', status: 'draft' as const },
      { id: 'c', title: 'alfa', status: 'closed' as const },
    ]
    expect(reportJobOptions(jobs)).toEqual([
      { id: 'c', title: 'alfa' },
      { id: 'a', title: 'Zeta' },
    ])
  })
})
