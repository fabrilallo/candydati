import type { Role } from '@tt/domain'
import { z } from 'zod'
import type { AuthClient } from './auth-client'
import { AppError, toAppError, type RawAuthError } from './auth-errors'

/**
 * Thin, validated adapter over the Better Auth client. Every call: unwraps `{ data, error }`, maps errors to
 * translatable `AppError`s (raw server text is never shown) and parses `data` with Zod, so the screens deal
 * with plain typed objects and tests mock one small interface.
 */
const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() })
const sessionSchema = z
  .object({ user: userSchema, session: z.object({ activeOrganizationId: z.string().nullish() }) })
  .nullable()
const organizationSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() })
const fullOrganizationSchema = organizationSchema.extend({
  members: z.array(z.object({ id: z.string(), userId: z.string(), role: z.string(), user: z.object({ name: z.string(), email: z.string() }) })),
  invitations: z.array(z.object({ id: z.string(), email: z.string(), role: z.string().nullish(), status: z.string(), expiresAt: z.union([z.string(), z.date()]) })),
})
const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string().nullish(),
  status: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  inviterEmail: z.string().nullish(),
})

export type SessionUser = z.infer<typeof userSchema>
export type OrganizationSummary = z.infer<typeof organizationSchema>
export interface SessionInfo {
  readonly user: SessionUser
  readonly activeOrganizationId: string | null
}
export interface MemberRow {
  readonly id: string
  readonly userId: string
  readonly role: string
  readonly name: string
  readonly email: string
}
export interface PendingInvitation {
  readonly id: string
  readonly email: string
  readonly role: string | null
  readonly expiresAt: string
}
export interface FullOrganization extends OrganizationSummary {
  readonly members: readonly MemberRow[]
  readonly invitations: readonly PendingInvitation[]
}
export interface InvitationInfo {
  readonly id: string
  readonly email: string
  readonly role: string | null
  readonly status: string
  readonly organizationId: string
  readonly organizationName: string
  readonly inviterEmail: string | null
}

type Result = { readonly data: unknown; readonly error: RawAuthError | null }

const settle = async (call: () => Promise<unknown>): Promise<unknown> => {
  let result: Result
  try {
    result = (await call()) as Result
  } catch (cause) {
    console.error('[auth-api] request failed', cause instanceof Error ? cause.message : cause)
    throw new AppError('errors.unreachable')
  }
  if (result.error) throw toAppError(result.error)
  return result.data
}

const parse = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    console.error('[auth-api] unexpected response shape', z.prettifyError(parsed.error))
    throw new AppError('errors.generic', 'invalid_response')
  }
  return parsed.data
}

/** The client types roles from its own access-control config; ours live in `@tt/domain` and are enforced by the api. */
type InviteRole = Parameters<AuthClient['organization']['inviteMember']>[0]['role']

const asIso = (value: string | Date): string => (value instanceof Date ? value.toISOString() : value)

const toFullOrganization = (full: z.infer<typeof fullOrganizationSchema>): FullOrganization => ({
  id: full.id,
  name: full.name,
  slug: full.slug,
  members: full.members.map((m) => ({ id: m.id, userId: m.userId, role: m.role, name: m.user.name, email: m.user.email })),
  invitations: full.invitations
    .filter((invitation) => invitation.status === 'pending')
    .map((i) => ({ id: i.id, email: i.email, role: i.role ?? null, expiresAt: asIso(i.expiresAt) })),
})

export const createAuthApi = (client: AuthClient) => {
  const org = client.organization
  return {
    async signIn(input: { email: string; password: string }): Promise<void> {
      await settle(() => client.signIn.email({ email: input.email, password: input.password }))
    },
    async signUp(input: { name: string; email: string; password: string }): Promise<void> {
      await settle(() => client.signUp.email({ name: input.name, email: input.email, password: input.password }))
    },
    async signOut(): Promise<void> {
      await settle(() => client.signOut())
    },
    async getSession(): Promise<SessionInfo | null> {
      const session = parse(sessionSchema, await settle(() => client.getSession()))
      return session ? { user: session.user, activeOrganizationId: session.session.activeOrganizationId ?? null } : null
    },
    async listOrganizations(): Promise<readonly OrganizationSummary[]> {
      const list = parse(z.array(organizationSchema), await settle(() => org.list()))
      return list.map(({ id, name, slug }) => ({ id, name, slug }))
    },
    async createOrganization(input: { name: string; slug: string }): Promise<OrganizationSummary> {
      const created = parse(organizationSchema, await settle(() => org.create({ name: input.name, slug: input.slug })))
      return { id: created.id, name: created.name, slug: created.slug }
    },
    async setActiveOrganization(organizationId: string): Promise<void> {
      await settle(() => org.setActive({ organizationId }))
    },
    async getFullOrganization(): Promise<FullOrganization | null> {
      const full = parse(fullOrganizationSchema.nullable(), await settle(() => org.getFullOrganization()))
      return full ? toFullOrganization(full) : null
    },
    async inviteMember(input: { email: string; role: Role }): Promise<void> {
      await settle(() => org.inviteMember({ email: input.email, role: input.role as InviteRole }))
    },
    async cancelInvitation(invitationId: string): Promise<void> {
      await settle(() => org.cancelInvitation({ invitationId }))
    },
    async getInvitation(id: string): Promise<InvitationInfo> {
      const invitation = parse(invitationSchema, await settle(() => org.getInvitation({ query: { id } })))
      return { ...invitation, role: invitation.role ?? null, inviterEmail: invitation.inviterEmail ?? null }
    },
    async acceptInvitation(invitationId: string): Promise<void> {
      await settle(() => org.acceptInvitation({ invitationId }))
    },
    async rejectInvitation(invitationId: string): Promise<void> {
      await settle(() => org.rejectInvitation({ invitationId }))
    },
  }
}

export type AuthApi = ReturnType<typeof createAuthApi>
