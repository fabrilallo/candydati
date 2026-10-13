import type { Role } from '@tt/domain'
import type { AuthApi, OrganizationSummary, SessionUser } from './auth-api'
import { parseMemberRole } from './permissions-ui'

/** Who is looking at the app: the signed-in user, their active organization and role in it. */
export interface Viewer {
  readonly user: SessionUser
  readonly organization: OrganizationSummary | null
  readonly role: Role | null
}

const withoutOrganization = (user: SessionUser): Viewer => ({ user, organization: null, role: null })

/** Activates the first organization of the user when the session has none (e.g. right after sign in). */
const ensureActiveOrganization = async (api: AuthApi, activeId: string | null): Promise<string | null> => {
  if (activeId) return activeId
  const [first] = await api.listOrganizations()
  if (!first) return null
  await api.setActiveOrganization(first.id)
  return first.id
}

export const loadViewer = async (api: AuthApi): Promise<Viewer | null> => {
  const session = await api.getSession()
  if (!session) return null
  const activeId = await ensureActiveOrganization(api, session.activeOrganizationId)
  if (!activeId) return withoutOrganization(session.user)
  const full = await api.getFullOrganization()
  if (!full) return withoutOrganization(session.user)
  const member = full.members.find((candidate) => candidate.userId === session.user.id)
  return {
    user: session.user,
    organization: { id: full.id, name: full.name, slug: full.slug },
    role: parseMemberRole(member?.role),
  }
}
