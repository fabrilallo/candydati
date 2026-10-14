import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import type { MemberOption } from '@/lib/interviewers'
import { getJobTeam, putJobTeamMember, removeJobTeamMember, sortTeam, teamCandidates, type JobTeamDto, type JobTeamRole } from '@/lib/job-team-api'
import { attempt } from '@/lib/load-result'

/**
 * The "Team" tab of a job: who sees its candidates. Each change is saved at once; the screen shows what the api answered.
 */
export const useJobTeam = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const organization = useMembers()
  const { data, refresh } = useFreshAsyncData(`job-team-${jobId}`, () => attempt(() => getJobTeam(request, jobId)))
  const local = ref<JobTeamDto | null>(null)
  const team = computed(() => local.value ?? data.value?.data ?? null)
  const busy = ref<string | null>(null)
  const members = computed(() => sortTeam(team.value?.members ?? []))
  const options = computed<readonly MemberOption[]>(() =>
    teamCandidates(organization.members.value.map((m) => ({ userId: m.userId, name: m.name, email: m.email })), members.value),
  )

  const run = async (userId: string, work: () => Promise<void>, savedKey: string): Promise<boolean> => {
    busy.value = userId
    try {
      await work()
      toast.success(t(savedKey))
      return true
    } catch (error) {
      toast.error(t('jobTeam.saveFailed'), { description: t(errorKeyOf(error)) })
      return false
    } finally {
      busy.value = null
    }
  }

  const put = (userId: string, role: JobTeamRole): Promise<boolean> =>
    run(userId, async () => {
      local.value = await putJobTeamMember(request, jobId, userId, role)
    }, 'jobTeam.saved')

  const remove = (userId: string): Promise<boolean> =>
    run(userId, async () => {
      await removeJobTeamMember(request, jobId, userId)
      local.value = await getJobTeam(request, jobId)
    }, 'jobTeam.removed')

  return {
    members,
    options,
    errorKey: computed(() => data.value?.errorKey ?? null),
    loaded: computed(() => team.value !== null),
    busy: computed(() => busy.value),
    put,
    remove,
    refresh,
  }
}
