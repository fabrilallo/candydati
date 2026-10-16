import type { EmailSettingsDto } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { getEmailSettings, updateEmailSettings, verifyEmailDomain, type EmailSettingsInput } from '@/lib/message-api'

/** The sending identity of the organization (`email_settings:manage`): read, save, ask the provider to check DNS. */
export const useEmailSettings = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, status, refresh } = useAsyncData('email-settings', () => loaded(() => getEmailSettings(request)))
  const current = ref<EmailSettingsDto | null>(data.value?.data ?? null)
  watch(data, (fresh) => {
    current.value = fresh?.data ?? null
  })
  const busy = ref<'save' | 'verify' | null>(null)
  const actionErrorKey = ref<string | null>(null)

  const run = async (kind: 'save' | 'verify', action: () => Promise<EmailSettingsDto>, successKey: string): Promise<boolean> => {
    busy.value = kind
    actionErrorKey.value = null
    try {
      current.value = await action()
      toast.success(t(successKey))
      return true
    } catch (error) {
      actionErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      busy.value = null
    }
  }

  return {
    settings: computed(() => current.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    busy: computed(() => busy.value),
    actionErrorKey: computed(() => actionErrorKey.value),
    refresh,
    save: (input: EmailSettingsInput) => run('save', () => updateEmailSettings(request, input), 'emailSettings.saved'),
    verify: () => run('verify', () => verifyEmailDomain(request), 'emailSettings.checked'),
  }
}
