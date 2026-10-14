import { describe, expect, it, vi } from 'vitest'
import type { JobApiRequest } from './job-api'
import { getAccessSetting, getJobTeam, putJobTeamMember, removeJobTeamMember, setAccessSetting, sortTeam, teamCandidates } from './job-team-api'

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, error: null } })
const stub = (response: unknown) => vi.fn<JobApiRequest>().mockResolvedValue(response as never)
const member = (userId: string, overrides = {}) => ({ userId, name: userId.toUpperCase(), email: `${userId}@x.it`, role: 'interviewer', source: 'team', stageIds: [], removable: true, addedAt: null, ...overrides })

describe('job team api', () => {
  it('reads the team of a job', async () => {
    const request = stub(ok({ jobId: 'j 1', members: [member('u1')] }))
    expect((await getJobTeam(request, 'j 1')).members[0]?.userId).toBe('u1')
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j%201/team', undefined)
    await expect(getJobTeam(stub(ok({ jobId: 'j', members: [member('u1', { role: 'owner' })] })), 'j')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('adds with PUT and removes with DELETE', async () => {
    const request = stub(ok({ jobId: 'j', members: [] }))
    await putJobTeamMember(request, 'j', 'u1', 'recruiter')
    expect(request).toHaveBeenCalledWith('/api/v1/jobs/j/team/u1', expect.objectContaining({ method: 'PUT', body: { role: 'recruiter' } }))
    const remove = stub(ok({ removed: true }))
    expect(await removeJobTeamMember(remove, 'j', 'u1')).toBe(true)
    expect(remove).toHaveBeenCalledWith('/api/v1/jobs/j/team/u1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('reads and sets the recruiter restriction', async () => {
    expect(await getAccessSetting(stub(ok({ restrictRecruitersToTeam: false })))).toBe(false)
    const request = stub(ok({ restrictRecruitersToTeam: true }))
    expect(await setAccessSetting(request, true)).toBe(true)
    expect(request).toHaveBeenCalledWith('/api/v1/settings/access', expect.objectContaining({ method: 'PUT', body: { restrictRecruitersToTeam: true } }))
  })

  it('sorts the team (explicit members first, by name) and offers only members not on it', () => {
    const team = [member('b', { source: 'stage_interviewer' }), member('c'), member('a')] as never
    expect(sortTeam(team).map((m) => m.userId)).toEqual(['a', 'c', 'b'])
    const options = teamCandidates([{ userId: 'a', name: 'A', email: '' }, { userId: 'b', name: 'B', email: '' }, { userId: 'z', name: 'Z', email: '' }], team)
    expect(options.map((m) => m.userId)).toEqual(['b', 'z'])
  })
})
