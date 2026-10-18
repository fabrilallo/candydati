import type { OrganizationLogoSource } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { getOrganizationLogo, setOrganizationLogo } from '@/lib/organization-logo-api'
import { safeLogoUrl } from '@/lib/safe-url'

/**
 * The active organization's logo, shared by key between the navigation, the ad editor's preview and the careers page
 * editor: a change made in one shows in the others at once.
 */
export const useOrganizationLogo = () => {
  const request = useJobsApi()
  const { viewer } = useViewer()
  const organizationId = computed(() => viewer.value?.organization?.id ?? null)
  const { data } = useAsyncData(
    () => `organization-logo:${organizationId.value ?? 'none'}`,
    () => (organizationId.value ? loaded(() => getOrganizationLogo(request)) : Promise.resolve(null)),
  )
  const busy = ref(false)

  /** Changes the logo; resolves the translation key of the refusal, or null when it is saved. */
  const set = async (source: OrganizationLogoSource | null): Promise<string | null> => {
    busy.value = true
    try {
      data.value = { data: await setOrganizationLogo(request, source), errorKey: null }
      return null
    } catch (error) {
      return errorKeyOf(error)
    } finally {
      busy.value = false
    }
  }

  return {
    source: computed(() => data.value?.data?.source ?? null),
    /** Checked: an https address or a file of the public media route, else null. */
    url: computed(() => safeLogoUrl(data.value?.data?.url)),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    set,
  }
}
