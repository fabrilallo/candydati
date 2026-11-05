import type { ConsentPreview, Role } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { answerConsent, previewConsent, setActiveOrganization } from '@/lib/connected-app-api'
import { defaultOrganizationId, grantedScope, offersProposeMove } from '@/lib/oauth-flow'

type Answer = 'allow' | 'deny'

/**
 * State of the consent page: the request it received, the organization picked, and the answer. Allow switches the
 * session's active organization first when another one was picked (the grant is for the active one), then answers;
 * either answer ends with a full page load to where the server says (the app's redirect address).
 */
export const useOAuthConsent = (oauthQuery: string | null) => {
  const request = useJobsApi()
  const preview = ref<ConsentPreview | null>(null)
  const loadErrorKey = ref<string | null>(oauthQuery ? null : 'oauth.errors.expired')
  const errorKey = ref<string | null>(null)
  const selectedId = ref<string | null>(null)
  const pending = ref<Answer | null>(null)
  /** The opt-in to propose moves: unchecked unless the person ticks it. */
  const proposeMove = ref(false)

  const load = async (): Promise<void> => {
    if (!oauthQuery) return
    try {
      preview.value = await previewConsent(request, oauthQuery)
      selectedId.value = defaultOrganizationId(preview.value.organizations)
    } catch (error) {
      loadErrorKey.value = errorKeyOf(error)
    }
  }

  const selected = computed(() => preview.value?.organizations.find((organization) => organization.id === selectedId.value) ?? null)
  const offersPropose = computed(() => (preview.value && selected.value ? offersProposeMove(preview.value.scopes, selected.value.role) : false))
  const canAllow = computed(() => selected.value !== null && !selected.value.twoFactorRequired && pending.value === null)

  /** The picked organization is now the session's active one: remembered, so a retry does not switch again. */
  const markActive = (id: string): void => {
    if (!preview.value) return
    const organizations = preview.value.organizations.map((organization) => ({ ...organization, active: organization.id === id }))
    preview.value = { ...preview.value, organizations }
  }

  /** Sent only when it grants less than the app asked for: otherwise the request's own scopes stand. */
  const narrowedScope = (organization: { readonly role: Role } | null): string | undefined => {
    if (!preview.value || !organization) return undefined
    const scope = grantedScope(preview.value.scopes, organization.role, proposeMove.value)
    return scope === preview.value.scopes.join(' ') ? undefined : scope
  }

  const answer = async (choice: Answer): Promise<void> => {
    if (!oauthQuery || pending.value !== null) return
    const organization = selected.value
    if (choice === 'allow' && (!organization || organization.twoFactorRequired)) return
    pending.value = choice
    errorKey.value = null
    try {
      if (choice === 'allow' && organization && !organization.active) {
        await setActiveOrganization(request, organization.id)
        markActive(organization.id)
      }
      const url = await answerConsent(request, oauthQuery, choice === 'allow', narrowedScope(organization))
      await navigateTo(url, { external: true })
    } catch (error) {
      errorKey.value = errorKeyOf(error)
      pending.value = null
    }
  }

  return { preview, loadErrorKey, errorKey, selectedId, selected, canAllow, pending, proposeMove, offersPropose, load, answer }
}
