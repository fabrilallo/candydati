import type { InstanceEmailSettingsDto, InstanceEmailSettingsInput } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getInstanceEmailSettings, isTestFailure, saveInstanceEmailSettings } from '@/lib/instance-email-api'
import { loaded } from '@/lib/job-api'

const KEY = 'instance-email-settings'

/**
 * Whether the instance can send email, shared by the banner, the first steps and the settings card. Fetched once per
 * session load (one `useAsyncData` key); a successful save replaces it for everyone.
 */
export const useInstanceEmailStatus = () => {
  const request = useJobsApi()
  const { data, status, refresh } = useAsyncData(KEY, () => loaded(() => getInstanceEmailSettings(request)), { dedupe: 'defer' })
  const settings = computed<InstanceEmailSettingsDto | null>(() => data.value?.data ?? null)
  return {
    settings,
    /** `null` while unknown (loading or failed): nothing is claimed either way. */
    ready: computed(() => settings.value?.ready ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    refresh,
    adopt: (fresh: InstanceEmailSettingsDto): void => {
      data.value = { data: fresh, errorKey: null }
    },
  }
}

/** The settings card: the status plus a save that first sends a test email to the admin's own address. */
export const useInstanceEmail = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { viewer } = useViewer()
  const status = useInstanceEmailStatus()
  const busy = ref(false)
  const errorKey = ref<string | null>(null)
  const testFailed = ref(false)
  const sentTo = ref<string | null>(null)

  const save = async (input: InstanceEmailSettingsInput): Promise<boolean> => {
    busy.value = true
    errorKey.value = null
    testFailed.value = false
    sentTo.value = null
    try {
      status.adopt(await saveInstanceEmailSettings(request, input))
      sentTo.value = viewer.value?.user.email ?? ''
      toast.success(t('instanceEmail.saved'))
      return true
    } catch (error) {
      errorKey.value = errorKeyOf(error)
      testFailed.value = isTestFailure(error)
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
    /** The address the test email went to after a successful save (`''` when the viewer's address is unknown). */
    sentTo: computed(() => sentTo.value),
    save,
  }
}
