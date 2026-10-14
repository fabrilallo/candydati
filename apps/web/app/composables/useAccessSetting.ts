import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { getAccessSetting, setAccessSetting } from '@/lib/job-team-api'
import { loaded } from '@/lib/job-api'

/** Whether recruiters see only the jobs of their teams (owners and admins change it; off by default). */
export const useAccessSetting = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data } = useFreshAsyncData('access-setting', () => loaded(() => getAccessSetting(request)))
  const override = ref<boolean | null>(null)
  const saving = ref(false)
  const value = computed(() => override.value ?? data.value?.data ?? null)

  const change = async (next: boolean): Promise<void> => {
    saving.value = true
    try {
      override.value = await setAccessSetting(request, next)
      toast.success(t('members.access.saved'))
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      saving.value = false
    }
  }
  return { value, saving: computed(() => saving.value), errorKey: computed(() => data.value?.errorKey ?? null), change }
}
