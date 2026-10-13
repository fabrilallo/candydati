import type { PrivacyNoticeDto, Locale, PrivacyNoticeInput  } from '@tt/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { getActivePrivacyNotice, getPrivacyTemplate, listPrivacyVersions, publishPrivacyNotice } from '@/lib/privacy-api'

interface PrivacyState {
  readonly active: PrivacyNoticeDto | null
  readonly versions: readonly PrivacyNoticeDto[]
  /** The default text, loaded only while no version exists yet. */
  readonly template: string | null
}

/** The privacy settings (`privacy:manage`): active version, history, template for the first one, publishing. */
export const usePrivacySettings = () => {
  const { t, locale } = useI18n()
  const request = useJobsApi()
  const load = async (): Promise<PrivacyState> => {
    const [active, versions] = await Promise.all([getActivePrivacyNotice(request), listPrivacyVersions(request)])
    const template = active ? null : await getPrivacyTemplate(request, locale.value === 'en' ? 'en' : 'it')
    return { active, versions, template }
  }
  const { data, status, refresh } = useAsyncData('privacy-settings', () => loaded(load))
  const publishing = ref(false)
  const publishErrorKey = ref<string | null>(null)

  const publish = async (input: PrivacyNoticeInput): Promise<PrivacyNoticeDto | null> => {
    publishing.value = true
    publishErrorKey.value = null
    try {
      const created = await publishPrivacyNotice(request, input)
      toast.success(t('privacy.published', { version: created.version }))
      clearNuxtData('privacy-active')
      await refresh()
      return created
    } catch (error) {
      publishErrorKey.value = errorKeyOf(error)
      return null
    } finally {
      publishing.value = false
    }
  }

  /** Another language's template, on request (the text is replaced only after the user confirms). */
  const template = async (language: Locale): Promise<string | null> => {
    try {
      return await getPrivacyTemplate(request, language)
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return null
    }
  }

  return {
    state: computed(() => data.value?.data ?? null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    loading: computed(() => status.value === 'pending'),
    publishing: computed(() => publishing.value),
    publishErrorKey: computed(() => publishErrorKey.value),
    refresh,
    publish,
    template,
  }
}

/** Only the active notice, for the dashboard reminder. Any member may read it. */
export const useActivePrivacyNotice = () => {
  const request = useJobsApi()
  const { data, status } = useAsyncData('privacy-active', () => loaded(() => getActivePrivacyNotice(request)))
  return {
    /** `true` only once the api answered that there is no notice; never on a failed load. */
    missing: computed(() => data.value !== null && data.value !== undefined && data.value.errorKey === null && data.value.data === null),
    loading: computed(() => status.value === 'pending'),
  }
}
