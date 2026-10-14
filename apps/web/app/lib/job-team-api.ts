import { JOB_TEAM_ROLES, type JobTeamRole } from '@tt/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import { ACCESS_SETTINGS_PATH, jobTeamMemberPath, jobTeamPath } from './api-paths'
import type { MemberOption } from './interviewers'
import type { JobApiRequest } from './job-api'

/** The team of a job (who sees its candidates). Stage interviewers are members implicitly and cannot be removed here. */
export const jobTeamMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(JOB_TEAM_ROLES),
  source: z.enum(['team', 'stage_interviewer']),
  stageIds: z.array(z.string()),
  removable: z.boolean(),
  addedAt: z.string().nullable(),
})
export const jobTeamSchema = z.object({ jobId: z.string(), members: z.array(jobTeamMemberSchema) })
export type JobTeamMemberDto = z.infer<typeof jobTeamMemberSchema>
export type JobTeamDto = z.infer<typeof jobTeamSchema>
export { JOB_TEAM_ROLES, type JobTeamRole }

const accessSchema = z.object({ restrictRecruitersToTeam: z.boolean() })

export const getJobTeam = async (request: JobApiRequest, jobId: string): Promise<JobTeamDto> => (await callApi(request, jobTeamPath(jobId), jobTeamSchema)).data

export const putJobTeamMember = async (request: JobApiRequest, jobId: string, userId: string, role: JobTeamRole): Promise<JobTeamDto> =>
  (await callApi(request, jobTeamMemberPath(jobId, userId), jobTeamSchema, { method: 'PUT', body: { role } })).data

export const removeJobTeamMember = async (request: JobApiRequest, jobId: string, userId: string): Promise<boolean> =>
  (await callApi(request, jobTeamMemberPath(jobId, userId), z.object({ removed: z.boolean() }), { method: 'DELETE' })).data.removed

export const getAccessSetting = async (request: JobApiRequest): Promise<boolean> => (await callApi(request, ACCESS_SETTINGS_PATH, accessSchema)).data.restrictRecruitersToTeam

export const setAccessSetting = async (request: JobApiRequest, restrictRecruitersToTeam: boolean): Promise<boolean> =>
  (await callApi(request, ACCESS_SETTINGS_PATH, accessSchema, { method: 'PUT', body: { restrictRecruitersToTeam } })).data.restrictRecruitersToTeam

/** Pure: explicit members first, then stage interviewers, each by name. */
export const sortTeam = (members: readonly JobTeamMemberDto[]): readonly JobTeamMemberDto[] =>
  members.toSorted((a, b) => Number(a.source !== 'team') - Number(b.source !== 'team') || a.name.localeCompare(b.name))

/** Pure: the members of the organization not explicitly on the team yet (a stage interviewer can still be added), by name. */
export const teamCandidates = (members: readonly MemberOption[], team: readonly JobTeamMemberDto[]): readonly MemberOption[] =>
  members.filter((member) => !team.some((current) => current.userId === member.userId && current.source === 'team')).toSorted((a, b) => a.name.localeCompare(b.name))
