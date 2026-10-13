import { describe, expect, it } from 'vitest'
import { addInterviewer, availableMembers, checkExternal, getInterviewers, INTERVIEWERS_MAX, interviewersBody, memberInterviewer, putInterviewers, removeInterviewer } from './interviewers'
import type { JobApiRequest } from './job-api'

const anna = memberInterviewer({ userId: 'u1', name: 'Anna Bianchi', email: 'anna@example.com' })
const ext = { kind: 'external' as const, userId: null, email: 'luca@studio.it', name: 'Luca Verdi' }

describe('interviewers of a stage', () => {
  it('adds once, removes by position, never past the maximum', () => {
    const list = addInterviewer([anna], ext)
    expect(list).toEqual([anna, ext])
    expect(addInterviewer(list, { ...ext, email: 'LUCA@studio.it' })).toBe(list)
    expect(addInterviewer(list, anna)).toBe(list)
    expect(removeInterviewer(list, 0)).toEqual([ext])
    const full = Array.from({ length: INTERVIEWERS_MAX }, (_, i) => ({ ...ext, email: `p${i}@x.it` }))
    expect(addInterviewer(full, anna)).toBe(full)
  })

  it('validates an external person with the domain rules', () => {
    expect(checkExternal(' Luca Verdi ', ' LUCA@studio.it ')).toEqual({ ok: true, interviewer: ext })
    expect(checkExternal('', 'nope')).toEqual({ ok: false, errors: { name: 'job.interviewers.nameRequired', email: 'job.interviewers.emailInvalid' } })
  })

  it('offers only the members not chosen yet, by name', () => {
    const members = [
      { userId: 'u2', name: 'Zeno', email: 'z@x.it' },
      { userId: 'u1', name: 'Anna Bianchi', email: 'anna@example.com' },
      { userId: 'u3', name: 'Bruno', email: 'b@x.it' },
    ]
    expect(availableMembers(members, [anna]).map((member) => member.name)).toEqual(['Bruno', 'Zeno'])
  })

  it('sends members by id and externals by name and email, empty stages empty', () => {
    expect(interviewersBody({ s1: [anna, ext], s2: [] })).toEqual([
      { stageId: 's1', interviewers: [{ kind: 'member', userId: 'u1', name: 'Anna Bianchi' }, { kind: 'external', name: 'Luca Verdi', email: 'luca@studio.it' }] },
      { stageId: 's2', interviewers: [] },
    ])
  })

  it('reads and writes through the api', async () => {
    const calls: unknown[] = []
    const request: JobApiRequest = async (url, init) => {
      calls.push({ url, init })
      return { status: 200, body: { success: true, data: [{ stageId: 's1', interviewers: [{ kind: 'member', userId: 'u1', email: null, name: 'Anna' }] }] } }
    }
    expect(await getInterviewers(request, 'j 1')).toEqual({ s1: [{ kind: 'member', userId: 'u1', email: null, name: 'Anna' }] })
    await putInterviewers(request, 'j1', { s1: [ext] })
    expect(calls[0]).toMatchObject({ url: '/api/v1/jobs/j%201/interviewers' })
    expect(calls[1]).toMatchObject({ init: { method: 'PUT', body: { stages: [{ stageId: 's1', interviewers: [{ kind: 'external', name: 'Luca Verdi', email: 'luca@studio.it' }] }] } } })
  })
})
