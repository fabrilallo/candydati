import { describe, expect, it } from 'vitest'
import {
  canPhase9,
  feedbackRequestSchema,
  interviewFeedbackSchema,
  isComplianceRule,
  jobApprovalSchema,
  jobRequestSchema,
  publicFeedbackSchema,
  staleJobSchema,
} from './phase9-contract'

const at = '2026-10-13T19:44:08.548Z'

describe('Phase 9 wire shapes read leniently', () => {
  it('reads a job request as the core entity: bare person ids, location object, empty notes, unknown enums', () => {
    const request = jobRequestSchema.parse({
      id: 'r1',
      requestedBy: 'u1',
      title: 'Data Engineer',
      role: 'data_engineer',
      reason: 'Serve.',
      salaryMin: 45000,
      salaryMax: 55000,
      workMode: 'weird',
      location: { city: 'Milano', country: 'IT' },
      processNotes: '',
      status: 'submitted',
      decidedBy: null,
      createdAt: at,
    })
    expect(request).toMatchObject({ requestedBy: { id: 'u1', name: null }, decidedBy: null, location: 'Milano, IT', processNotes: null, seniority: null, workMode: null, currency: 'EUR', headcount: 1 })
    expect(jobRequestSchema.parse({ id: 'r2', title: 'T', status: 'other', createdAt: at, location: {} }).location).toBeNull()
  })

  it('reads feedback requests and feedback with the interviewer as a name, the public view as the core sends it', () => {
    const request = feedbackRequestSchema.parse({ id: 'f1', stageId: 's1', interviewerName: 'Paolo', interviewerKind: 'member', status: 'expired', createdAt: at })
    expect(request).toMatchObject({ interviewer: { kind: 'member', name: 'Paolo' }, state: 'expired', requestedAt: at })
    expect(interviewFeedbackSchema.parse({ id: 'x', stageId: 's1', interviewerName: 'Paolo', recommendation: 'proceed', submittedAt: at }).interviewer.name).toBe('Paolo')
    const view = publicFeedbackSchema.parse({
      organizationName: 'Acme',
      jobTitle: 'Backend',
      candidate: { firstName: 'Marta', lastName: 'Verdi' },
      stage: { label: 'Colloquio', note: null },
      questions: [{ id: 'q1', label: 'Cosa ha mostrato', required: true }],
      submission: { answers: {}, recommendation: 'proceed', submittedAt: at },
    })
    expect(view).toMatchObject({ organization: { name: 'Acme' }, job: { title: 'Backend' }, submitted: true, questions: [{ id: 'q1', hint: null }] })
  })

  it('reads a stale job from the core view or flat', () => {
    expect(staleJobSchema.parse({ job: { id: 'j1', title: 'Backend', publishedAt: at }, lastActivityAt: at, daysIdle: 120 })).toMatchObject({ id: 'j1', title: 'Backend', daysSinceActivity: 120 })
    expect(staleJobSchema.parse({ job: { id: 'j2', content: { title: 'Data' } }, lastActivityAt: at, daysIdle: 91 }).title).toBe('Data')
  })

  it('reads an approval with a bare approver id, and anything malformed as none', () => {
    expect(jobApprovalSchema.parse({ approvedBy: 'u1', approvedAt: at, salaryMin: 1, salaryMax: 2 })?.approvedBy).toEqual({ id: 'u1', name: null })
    expect(jobApprovalSchema.parse('nope')).toBeNull()
    expect(jobApprovalSchema.parse(undefined)).toBeNull()
  })

  it('knows the compliance rules that block and the Phase 9 grants', () => {
    expect(isComplianceRule('gender_exclusive_title')).toBe(true)
    expect(isComplianceRule('required')).toBe(false)
    expect(canPhase9('owner', 'job:approve')).toBe(true)
    expect(canPhase9('recruiter', 'job:approve')).toBe(false)
    expect(canPhase9(null, 'feedback:read')).toBe(false)
  })
})
