import type { AgencySettingDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getAgencySetting, setAgencySetting } from '@/lib/client-api'
import { loaded } from '@/lib/job-api'

/**
 * "We recruit for clients" (PRODUCT.md §3.5), read once and shared by key: every place that shows clients (navigation,
 * job, jobs list, reports) asks `recruitsForClients`, which stays false while loading or on error, so nothing about
 * clients appears for an organization that has not turned it on. Owners and admins change it from the settings page.
 */
export const useAgencySetting = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useAsyncData('agency-setting', () => loaded(() => getAgencySetting(request)))
  const saving = ref(false)
  const setting = computed<AgencySettingDto | null>(() => data.value?.data ?? null)

  const save = async (next: AgencySettingDto): Promise<boolean> => {
    saving.value = true
    try {
      data.value = { data: await setAgencySetting(request, next), errorKey: null }
      toast.success(t('clients.setting.saved'))
      return true
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    setting,
    recruitsForClients: computed(() => setting.value?.recruitsForClients === true),
    errorKey: computed(() => data.value?.errorKey ?? null),
    saving: computed(() => saving.value),
    save,
    refresh,
  }
}
