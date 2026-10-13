import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getInterviewers, putInterviewers, type InterviewersByStage, type MemberOption } from '@/lib/interviewers'
import { attempt } from '@/lib/load-result'
import type { InterviewerDto } from '@/lib/phase9-contract'

/**
 * Who conducts each stage of a job ("Chi fa il colloquio"), shared by the editor and Automazioni. A change is saved at
 * once (it is not part of the ad's text) and rolled back with a message if the api refuses it.
 */
export const useJobInterviewers = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const team = useMembers()
  const { data, refresh } = useAsyncData(`job-interviewers-${jobId}`, () => attempt(() => getInterviewers(request, jobId)))
  const local = ref<InterviewersByStage | null>(null)
  const byStage = computed<InterviewersByStage>(() => local.value ?? data.value?.data ?? {})
  const saving = ref<string | null>(null)
  const members = computed<readonly MemberOption[]>(() => team.members.value.map((member) => ({ userId: member.userId, name: member.name, email: member.email })))

  const save = async (stageId: string, list: readonly InterviewerDto[]): Promise<void> => {
    const before = byStage.value
    local.value = { ...before, [stageId]: list }
    saving.value = stageId
    try {
      local.value = await putInterviewers(request, jobId, local.value)
      toast.success(t('job.interviewers.saved'))
    } catch (error) {
      local.value = before
      toast.error(t('job.interviewers.saveFailed'), { description: t(errorKeyOf(error)) })
    } finally {
      saving.value = null
    }
  }

  return {
    byStage,
    members,
    errorKey: computed(() => data.value?.errorKey ?? null),
    loaded: computed(() => data.value?.data !== undefined && data.value?.data !== null),
    saving,
    save,
    refresh,
  }
}
