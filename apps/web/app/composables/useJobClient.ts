import type { ClientDisplay, JobClientDto } from '@candydati/domain'
import type { Ref } from 'vue'
import { getJobClient, setJobClient } from '@/lib/client-api'
import { clientErrorKey } from '@/lib/client-view'
import { loaded, type Loaded } from '@/lib/job-api'

/** The client of a job, shared by key between the job tabs and the client control; loads only while `enabled`. */
export const useJobClient = (jobId: string, enabled: Ref<boolean>) => {
  const request = useJobsApi()
  const load = async (): Promise<Loaded<JobClientDto> | null> => (enabled.value ? loaded(() => getJobClient(request, jobId)) : null)
  const { data, refresh } = useAsyncData(`job-client-${jobId}`, load, { watch: [enabled] })
  const saving = ref(false)
  const saveErrorKey = ref<string | null>(null)

  const save = async (clientId: string | null, display: ClientDisplay): Promise<boolean> => {
    saving.value = true
    saveErrorKey.value = null
    try {
      data.value = { data: await setJobClient(request, jobId, { clientId, display }), errorKey: null }
      return true
    } catch (error) {
      saveErrorKey.value = clientErrorKey(error)
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    jobClient: computed<JobClientDto | null>(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    saveErrorKey: computed(() => saveErrorKey.value),
    saving: computed(() => saving.value),
    save,
    refresh,
  }
}
