import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { getSourcingNoticeByEmail, setSourcingNoticeByEmail } from '@/lib/sourcing-api'

/** Whether sourced contacts with a known email get the art. 14 notice by email at once (off by default). */
export const useSourcingSetting = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data } = useFreshAsyncData('sourcing-setting', () => loaded(() => getSourcingNoticeByEmail(request)))
  const override = ref<boolean | null>(null)
  const saving = ref(false)
  const value = computed(() => override.value ?? data.value?.data ?? null)

  const change = async (next: boolean): Promise<void> => {
    saving.value = true
    try {
      override.value = await setSourcingNoticeByEmail(request, next)
      toast.success(t('sourcingSetting.saved'))
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      saving.value = false
    }
  }
  return { value, saving: computed(() => saving.value), errorKey: computed(() => data.value?.errorKey ?? null), change }
}
