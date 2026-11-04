import { describe, expect, it, vi } from 'vitest'
import type { JobApiRequest } from './job-api'
import { atRestrictedStage, getRestrictedStages, restrictableStages, setStageRestriction } from './restricted-stages-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)

describe('restricted stages api', () => {
  it('reads the restricted stages of a job', async () => {
    const request = stub(ok({ jobId: 'j 1', stageIds: ['stage-1'], canManage: false }))
    expect(await getRestrictedStages(request, 'j 1')).toEqual({ jobId: 'j 1', stageIds: ['stage-1'], canManage: false })
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j%201/restricted-stages', undefined)
    await expect(getRestrictedStages(stub(ok({ jobId: 'j', stageIds: 'stage-1' })), 'j')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('marks or clears one stage with PUT', async () => {
    const request = stub(ok({ jobId: 'j', stageIds: ['stage-0'], canManage: true }))
    expect((await setStageRestriction(request, 'j', 'stage-0', true)).stageIds).toEqual(['stage-0'])
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j/stages/stage-0/restriction', expect.objectContaining({ method: 'PUT', body: { restricted: true } }))
  })
})

describe('restricted stage helpers', () => {
  it('says whether a stage is in the restricted list', () => {
    expect(atRestrictedStage('stage-1', ['stage-1'])).toBe(true)
    expect(atRestrictedStage('stage-0', ['stage-1'])).toBe(false)
    expect(atRestrictedStage(null, ['stage-1'])).toBe(false)
    expect(atRestrictedStage('stage-1', undefined)).toBe(false)
  })

  it('lists the declared stages of a job with their restriction, never "received"', () => {
    const stages = [{ id: 'received', declared: null }, { id: 'stage-0', declared: { type: 'screening_call' as const, durationMinutes: 30, conductedBy: 'recruiter' as const } }]
    expect(restrictableStages(stages, ['stage-0'], () => 'Chiamata')).toEqual([{ id: 'stage-0', name: 'Chiamata', restricted: true }])
  })
})
