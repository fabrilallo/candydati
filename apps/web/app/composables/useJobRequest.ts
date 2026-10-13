import type { JobRequestDto } from '@tt/domain'
import { toast } from 'vue-sonner'
import { getAgentStatus } from '@/lib/agent-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { approveJobRequest, convertJobRequest, getJobRequest, rejectJobRequest } from '@/lib/job-request-api'
import { requestSummary } from '@/lib/job-request-view'

/** One hiring request and what can be done to it: decide, make the ad, make the ad and hand it to the assistant. */
export const useJobRequest = (id: () => string) => {
  const { t, locale } = useI18n()
  const request = useJobsApi()
  const assistant = useAssistant()
  const prefill = useAssistantPrefill()
  const { data, refresh } = useFreshAsyncData(() => `job-request-${id()}`, () => loaded(() => getJobRequest(request, id())), { watch: [id] })
  const decided = ref<JobRequestDto | null>(null)
  watch(data, () => {
    decided.value = null
  })
  const item = computed(() => decided.value ?? data.value?.data ?? null)
  const busy = ref(false)
  const errorKey = ref<string | null>(null)
  const assistantEnabled = ref(false)

  const checkAssistant = async (): Promise<void> => {
    try {
      assistantEnabled.value = (await getAgentStatus(request)).enabled
    } catch {
      assistantEnabled.value = false
    }
  }

  const run = async <T>(action: () => Promise<T>): Promise<T | null> => {
    busy.value = true
    errorKey.value = null
    try {
      return await action()
    } catch (error) {
      errorKey.value = errorKeyOf(error)
      return null
    } finally {
      busy.value = false
    }
  }

  const decide = async (approve: boolean, note: string): Promise<boolean> => {
    const fresh = await run(() => (approve ? approveJobRequest(request, id(), note) : rejectJobRequest(request, id(), note)))
    if (!fresh) return false
    decided.value = fresh
    toast.success(t(approve ? 'jobRequests.decide.approved' : 'jobRequests.decide.rejected'))
    return true
  }

  const convert = async (withAssistant: boolean): Promise<void> => {
    const current = item.value
    const job = await run(() => convertJobRequest(request, id()))
    if (!job || !current) return
    if (withAssistant) {
      prefill.set(t('jobRequests.assistant.prompt', { summary: requestSummary(current, t, locale.value) }))
      assistant.open.value = true
    }
    await navigateTo(`/app/jobs/${encodeURIComponent(job.id)}`)
  }

  return {
    item,
    loadErrorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    errorKey: computed(() => errorKey.value),
    assistantEnabled: computed(() => assistantEnabled.value),
    checkAssistant,
    clearError: () => {
      errorKey.value = null
    },
    refresh,
    decide,
    convert,
  }
}
