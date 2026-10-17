import type { InstanceAiSettingsDto, InstanceAiSettingsInput } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getInstanceAiSettings, isAiTestFailure, saveInstanceAiSettings, testFailureDetail } from '@/lib/instance-ai-api'
import { loaded } from '@/lib/job-api'

const KEY = 'instance-ai-settings'

/** Which models the instance uses, fetched once per session load (one `useAsyncData` key); a save replaces it. */
export const useInstanceAiStatus = () => {
  const request = useJobsApi()
  const { data, status, refresh } = useAsyncData(KEY, () => loaded(() => getInstanceAiSettings(request)), { dedupe: 'defer' })
  return {
    settings: computed<InstanceAiSettingsDto | null>(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
    adopt: (fresh: InstanceAiSettingsDto): void => {
      data.value = { data: fresh, errorKey: null }
    },
  }
}

/** The settings page: the status plus a save that first sends a test call to each chosen model. */
export const useInstanceAi = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const status = useInstanceAiStatus()
  const assistantConfigured = useAssistantConfigured()
  const busy = ref(false)
  const errorKey = ref<string | null>(null)
  const testFailed = ref(false)
  const testDetail = ref<string | null>(null)
  const saved = ref(false)

  const fail = (error: unknown): void => {
    errorKey.value = errorKeyOf(error)
    testFailed.value = isAiTestFailure(error)
    testDetail.value = testFailureDetail(error)
  }

  const save = async (input: InstanceAiSettingsInput): Promise<boolean> => {
    busy.value = true
    errorKey.value = null
    testFailed.value = false
    testDetail.value = null
    saved.value = false
    try {
      const fresh = await saveInstanceAiSettings(request, input)
      status.adopt(fresh)
      assistantConfigured.value = fresh.assistantEnabled
      saved.value = true
      toast.success(t('instanceAi.saved'))
      return true
    } catch (error) {
      fail(error)
      return false
    } finally {
      busy.value = false
    }
  }

  return {
    settings: status.settings,
    loadErrorKey: status.errorKey,
    refresh: status.refresh,
    busy: computed(() => busy.value),
    errorKey: computed(() => errorKey.value),
    testFailed: computed(() => testFailed.value),
    /** What the provider said when a model did not answer (shown as plain text). */
    testDetail: computed(() => testDetail.value),
    saved: computed(() => saved.value),
    save,
  }
}
