import type { Role } from '@candydati/domain'
import { z } from 'zod'
import type { AuthClient } from './auth-client'
import { AppError, toAppError, type RawAuthError } from './auth-errors'

/**
 * Thin, validated adapter over the Better Auth client. Every call: unwraps `{ data, error }`, maps errors to
 * translatable `AppError`s (raw server text is never shown) and parses `data` with Zod, so the screens deal
 * with plain typed objects and tests mock one small interface.
 */
const userSchema = z
  .object({ id: z.string(), name: z.string(), email: z.string(), emailVerified: z.boolean().optional(), twoFactorEnabled: z.boolean().nullish() })
  .transform(({ id, name, email, emailVerified, twoFactorEnabled }) => ({ id, name, email, emailVerified: emailVerified ?? true, twoFactorEnabled: twoFactorEnabled === true }))
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

export interface SessionUser {
  readonly id: string
  readonly name: string
  readonly email: string
  /** Absent means confirmed: only a session older than the verification rule can be unconfirmed. */
  readonly emailVerified?: boolean
  readonly twoFactorEnabled?: boolean
}
const signInSchema = z.object({ twoFactorRedirect: z.boolean().optional() }).passthrough().nullable()
const signUpSchema = z.object({ user: z.object({ emailVerified: z.boolean() }).passthrough().optional() }).passthrough().nullable()
const enableTwoFactorSchema = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) })

/** What the person sees to enrol an authenticator: the otpauth URI and the backup codes, shown once. */
export interface TwoFactorEnrolment {
  readonly totpUri: string
  readonly backupCodes: readonly string[]
}
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

/** Header of the first owner's one-time setup token (the api reads it on sign-up only). */
export const BOOTSTRAP_TOKEN_HEADER = 'x-bootstrap-token'

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

/** The client types roles from its own access-control config; ours live in `@candydati/domain` and are enforced by the api. */
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

/** Sign-in, sign-up, confirmation and password reset. */
const accountMethods = (client: AuthClient) => ({
  /** `twoFactor`: the password was right and the account asks for its second factor (`verifyTotp`). */
  async signIn(input: { email: string; password: string; callbackURL?: string }): Promise<{ readonly twoFactor: boolean }> {
    const payload = { email: input.email, password: input.password, ...(input.callbackURL ? { callbackURL: input.callbackURL } : {}) }
    const result = parse(signInSchema, await settle(() => client.signIn.email(payload)))
    return { twoFactor: result?.twoFactorRedirect === true }
  },
  /**
   * No session: the account starts once the address is confirmed through the emailed link, which lands on `callbackURL`.
   * The first owner of a new instance adds the setup code, sent as a header only; it confirms the address at once
   * (`confirmed`), so the owner signs in without an email, which the instance may not be able to send yet.
   */
  async signUp(input: { name: string; email: string; password: string; callbackURL?: string; bootstrapToken?: string }): Promise<{ confirmed: boolean }> {
    const payload = { name: input.name, email: input.email, password: input.password, ...(input.callbackURL ? { callbackURL: input.callbackURL } : {}) }
    const token = input.bootstrapToken?.trim() ?? ''
    const result = parse(signUpSchema, await settle(() => (token === '' ? client.signUp.email(payload) : client.signUp.email(payload, { headers: { [BOOTSTRAP_TOKEN_HEADER]: token } }))))
    return { confirmed: result?.user?.emailVerified === true }
  },
  async sendVerificationEmail(input: { email: string; callbackURL: string }): Promise<void> {
    await settle(() => client.sendVerificationEmail({ email: input.email, callbackURL: input.callbackURL }))
  },
  /** Same answer whether the address has an account or not. */
  async requestPasswordReset(input: { email: string; redirectTo: string }): Promise<void> {
    await settle(() => client.requestPasswordReset({ email: input.email, redirectTo: input.redirectTo }))
  },
  async resetPassword(input: { token: string; newPassword: string }): Promise<void> {
    await settle(() => client.resetPassword({ token: input.token, newPassword: input.newPassword }))
  },
  async signOut(): Promise<void> {
    await settle(() => client.signOut())
  },
  async getSession(): Promise<SessionInfo | null> {
    const session = parse(sessionSchema, await settle(() => client.getSession()))
    return session ? { user: session.user, activeOrganizationId: session.session.activeOrganizationId ?? null } : null
  },
})

/** The person's second factor: enrolment, sign-in codes and backup codes. */
const twoFactorMethods = (client: AuthClient) => ({
  async verifyTotp(code: string): Promise<void> {
    await settle(() => client.twoFactor.verifyTotp({ code }))
  },
  async verifyBackupCode(code: string): Promise<void> {
    await settle(() => client.twoFactor.verifyBackupCode({ code }))
  },
  async enableTwoFactor(password: string): Promise<TwoFactorEnrolment> {
    const enrolment = parse(enableTwoFactorSchema, await settle(() => client.twoFactor.enable({ password })))
    return { totpUri: enrolment.totpURI, backupCodes: enrolment.backupCodes }
  },
  async disableTwoFactor(password: string): Promise<void> {
    await settle(() => client.twoFactor.disable({ password }))
  },
})

export const createAuthApi = (client: AuthClient) => {
  const org = client.organization
  return {
    ...accountMethods(client),
    ...twoFactorMethods(client),
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
