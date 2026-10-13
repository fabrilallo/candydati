import { INTERVIEWERS_PER_STAGE_MAX, interviewerInputSchema, stageInterviewersSchema, type InterviewerDto, type InterviewerInput } from '@tt/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import { jobInterviewersPath } from './api-paths'

/** Who conducts each stage of a job, by stage id. Stages without anyone are simply absent. */
export type InterviewersByStage = Readonly<Record<string, readonly InterviewerDto[]>>

export interface MemberOption {
  readonly userId: string
  readonly name: string
  readonly email: string
}

export const getInterviewers = async (request: JobApiRequest, jobId: string): Promise<InterviewersByStage> => {
  const { data } = await callApi(request, jobInterviewersPath(jobId), z.array(stageInterviewersSchema))
  return Object.fromEntries(data.map((stage) => [stage.stageId, stage.interviewers]))
}

const toInput = (interviewer: InterviewerDto): InterviewerInput =>
  interviewer.kind === 'member' && interviewer.userId
    ? { kind: 'member', userId: interviewer.userId, name: interviewer.name }
    : { kind: 'external', name: interviewer.name, email: interviewer.email ?? '' }

/** Pure: the `stages` of `PUT .../interviewers`. A stage left empty is sent empty, so the api clears it. */
export const interviewersBody = (byStage: InterviewersByStage): readonly { readonly stageId: string; readonly interviewers: readonly InterviewerInput[] }[] =>
  Object.entries(byStage).map(([stageId, list]) => ({ stageId, interviewers: list.map(toInput) }))

export const putInterviewers = async (request: JobApiRequest, jobId: string, byStage: InterviewersByStage): Promise<InterviewersByStage> => {
  const { data } = await callApi(request, jobInterviewersPath(jobId), z.array(stageInterviewersSchema), { method: 'PUT', body: { stages: interviewersBody(byStage) } })
  return Object.fromEntries(data.map((stage) => [stage.stageId, stage.interviewers]))
}

const sameAs = (a: InterviewerDto, b: InterviewerDto): boolean =>
  (a.userId !== null && a.userId === b.userId) || (a.email !== null && b.email !== null && a.email.toLowerCase() === b.email.toLowerCase())

/** Pure: the list with one more person; the same list when already there or full. */
export const addInterviewer = (list: readonly InterviewerDto[], next: InterviewerDto): readonly InterviewerDto[] =>
  list.length >= INTERVIEWERS_PER_STAGE_MAX || list.some((current) => sameAs(current, next)) ? list : [...list, next]

export const removeInterviewer = (list: readonly InterviewerDto[], index: number): readonly InterviewerDto[] => list.filter((_, i) => i !== index)

export const memberInterviewer = (member: MemberOption): InterviewerDto => ({ kind: 'member', userId: member.userId, email: member.email, name: member.name })

export type ExternalCheck = { readonly ok: true; readonly interviewer: InterviewerDto } | { readonly ok: false; readonly errors: Readonly<Partial<Record<'name' | 'email', string>>> }

/** Pure: an external person typed in the editor, validated with the domain schema. Keys are translation keys. */
export const checkExternal = (name: string, email: string): ExternalCheck => {
  const parsed = interviewerInputSchema.safeParse({ kind: 'external', name: name.trim() || undefined, email: email.trim().toLowerCase() || undefined })
  if (parsed.success) return { ok: true, interviewer: { kind: 'external', userId: null, email: parsed.data.email ?? null, name: parsed.data.name ?? '' } }
  const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0])))
  return {
    ok: false,
    errors: {
      ...(fields.has('name') ? { name: 'job.interviewers.nameRequired' } : {}),
      ...(fields.has('email') ? { email: 'job.interviewers.emailInvalid' } : {}),
    },
  }
}

/** Pure: the members not yet chosen for the stage, by name. */
export const availableMembers = (members: readonly MemberOption[], list: readonly InterviewerDto[]): readonly MemberOption[] =>
  members.filter((member) => !list.some((current) => current.userId === member.userId)).toSorted((a, b) => a.name.localeCompare(b.name))

export const INTERVIEWERS_MAX = INTERVIEWERS_PER_STAGE_MAX

/** What the editor's process section needs to show "Chi fa il colloquio" (only for a saved ad and `feedback:manage`). */
export interface InterviewersBinding {
  readonly byStage: InterviewersByStage
  readonly members: readonly MemberOption[]
  readonly saving: string | null
}
