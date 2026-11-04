import { describe, expect, it, vi } from 'vitest'
import type { JobApiRequest } from './job-api'
import { getScorecard, putScorecard, scorecardFailureKey, suggestScorecard } from './scorecard-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)
const SCORECARD = { jobId: 'j 1', criteria: [{ id: 'c1', label: 'Postgres', stageId: null, position: 0, locked: false }] }

describe('scorecard api', () => {
  it('reads the criteria of a job', async () => {
    const request = stub(ok(SCORECARD))
    expect((await getScorecard(request, 'j 1')).criteria[0]?.label).toBe('Postgres')
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j%201/scorecard', undefined)
  })

  it('replaces the list with PUT', async () => {
    const request = stub(ok(SCORECARD))
    await putScorecard(request, 'j', { criteria: [{ id: 'c1', label: 'Postgres', stageId: null }] })
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j/scorecard', expect.objectContaining({ method: 'PUT', body: { criteria: [{ id: 'c1', label: 'Postgres', stageId: null }] } }))
  })

  it('asks for a draft and reads the labels only when proposed', async () => {
    const request = stub(ok({ status: 'proposed', criteria: ['English B2'] }))
    expect(await suggestScorecard(request, 'j')).toEqual({ status: 'proposed', criteria: ['English B2'] })
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j/scorecard/suggest', expect.objectContaining({ method: 'POST' }))
    expect(await suggestScorecard(stub(ok({ status: 'unavailable' })), 'j')).toEqual({ status: 'unavailable', criteria: [] })
  })

  it('names the reason of a refused list, else the generic failure', () => {
    const failure = (message: string) => ({ status: 422, code: 'validation_failed', message: null, issues: [{ path: 'criteria.0.label', message }] })
    expect(scorecardFailureKey(failure('criterion_in_use'))).toBe('job.scorecard.errors.criterion_in_use')
    expect(scorecardFailureKey(failure('unknown_stage'))).toBe('job.scorecard.errors.unknown_stage')
    expect(scorecardFailureKey({ status: 403, code: 'forbidden', message: null, issues: [] })).toBe('errors.forbidden')
  })
})
