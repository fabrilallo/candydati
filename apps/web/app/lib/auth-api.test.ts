import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from './auth-errors'
import { createAuthApi } from './auth-api'
import type { AuthClient } from './auth-client'

type Settled = Promise<{ data: unknown; error: { status: number; code: string | undefined; message: string } | null }>
const ok = (data: unknown): Settled => Promise.resolve({ data, error: null })
const err = (status: number, code?: string): Settled => Promise.resolve({ data: null, error: { status, code, message: 'raw server text' } })

const user = { id: 'u1', name: 'Ada', email: 'ada@example.com' }

const fakeClient = (overrides: Record<string, unknown> = {}) => {
  const organization = {
    list: vi.fn((): Settled => ok([{ id: 'o1', name: 'Acme', slug: 'acme', createdAt: 'x' }])),
    create: vi.fn((): Settled => ok({ id: 'o1', name: 'Acme', slug: 'acme' })),
    setActive: vi.fn((): Settled => ok({})),
    getFullOrganization: vi.fn((): Settled =>
      ok({
        id: 'o1',
        name: 'Acme',
        slug: 'acme',
        members: [{ id: 'm1', userId: 'u1', role: 'owner', user }],
        invitations: [{ id: 'i1', email: 'new@example.com', role: 'recruiter', status: 'pending', expiresAt: '2030-01-01T00:00:00.000Z' }],
      }),
    ),
    inviteMember: vi.fn((): Settled => ok({ id: 'i2' })),
    cancelInvitation: vi.fn((): Settled => ok({})),
    updateMemberRole: vi.fn((): Settled => ok({})),
    getInvitation: vi.fn((): Settled =>
      ok({ id: 'i1', email: 'new@example.com', role: 'recruiter', status: 'pending', organizationId: 'o1', organizationName: 'Acme', inviterEmail: 'ada@example.com' }),
    ),
    acceptInvitation: vi.fn((): Settled => ok({ invitation: { organizationId: 'o1' } })),
    rejectInvitation: vi.fn((): Settled => ok({})),
  }
  const client = {
    signIn: { email: vi.fn((): Settled => ok({})) },
    signUp: { email: vi.fn((): Settled => ok({ token: null })) },
    sendVerificationEmail: vi.fn((): Settled => ok({ status: true })),
    requestPasswordReset: vi.fn((): Settled => ok({ status: true })),
    resetPassword: vi.fn((): Settled => ok({ status: true })),
    twoFactor: {
      enable: vi.fn((): Settled => ok({ totpURI: 'otpauth://totp/x?secret=ABC', backupCodes: ['a1', 'b2'] })),
      disable: vi.fn((): Settled => ok({ status: true })),
      verifyTotp: vi.fn((): Settled => ok({ token: 't' })),
      verifyBackupCode: vi.fn((): Settled => ok({ token: 't' })),
    },
    signOut: vi.fn((): Settled => ok({ success: true })),
    getSession: vi.fn((): Settled => ok({ user, session: { activeOrganizationId: 'o1' } })),
    organization,
    ...overrides,
  }
  return { client, organization, api: createAuthApi(client as unknown as AuthClient) }
}

describe('createAuthApi', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('signs in and up with the exact Better Auth payloads', async () => {
    const { client, api } = fakeClient()
    await api.signIn({ email: 'a@b.co', password: 'pw' })
    await api.signUp({ name: 'Ada', email: 'a@b.co', password: 'longpassword' })
    expect(client.signIn.email).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' })
    expect(client.signUp.email).toHaveBeenCalledWith({ name: 'Ada', email: 'a@b.co', password: 'longpassword' })
  })

  it('tells when the sign-in waits for the second factor, and passes the verification landing page', async () => {
    const { client, api } = fakeClient({ signIn: { email: vi.fn((): Settled => ok({ twoFactorRedirect: true })) } })
    expect(await api.signIn({ email: 'a@b.co', password: 'pw' })).toEqual({ twoFactor: true })
    expect(await fakeClient().api.signIn({ email: 'a@b.co', password: 'pw' })).toEqual({ twoFactor: false })
    await api.signUp({ name: 'Ada', email: 'a@b.co', password: 'longpassword', callbackURL: '/onboarding' })
    expect(client.signUp.email).toHaveBeenCalledWith({ name: 'Ada', email: 'a@b.co', password: 'longpassword', callbackURL: '/onboarding' })
  })

  it('sends the one-time setup token of the first owner as a header, never in the body or the URL', async () => {
    const { client, api } = fakeClient()
    await api.signUp({ name: 'Ada', email: 'a@b.co', password: 'longpassword', bootstrapToken: ' tok-123 ' })
    expect(client.signUp.email).toHaveBeenCalledWith({ name: 'Ada', email: 'a@b.co', password: 'longpassword' }, { headers: { 'x-bootstrap-token': 'tok-123' } })
  })

  it('signUp tells whether the address is already confirmed (the first owner through the setup link)', async () => {
    const { api, client } = fakeClient()
    expect(await api.signUp({ name: 'Ada', email: 'a@b.co', password: 'longpassword' })).toEqual({ confirmed: false })
    client.signUp.email.mockReturnValueOnce(ok({ token: null, user: { emailVerified: true } }))
    expect(await api.signUp({ name: 'Ada', email: 'a@b.co', password: 'longpassword', bootstrapToken: 'tok' })).toEqual({ confirmed: true })
  })

  it('resends the verification, asks and completes a password reset', async () => {
    const { client, api } = fakeClient()
    await api.sendVerificationEmail({ email: 'a@b.co', callbackURL: '/onboarding' })
    await api.requestPasswordReset({ email: 'a@b.co', redirectTo: '/reset-password' })
    await api.resetPassword({ token: 'tok', newPassword: 'long-enough-pw' })
    expect(client.sendVerificationEmail).toHaveBeenCalledWith({ email: 'a@b.co', callbackURL: '/onboarding' })
    expect(client.requestPasswordReset).toHaveBeenCalledWith({ email: 'a@b.co', redirectTo: '/reset-password' })
    expect(client.resetPassword).toHaveBeenCalledWith({ token: 'tok', newPassword: 'long-enough-pw' })
  })

  it('enrols, verifies and disables the second factor', async () => {
    const { client, api } = fakeClient()
    expect(await api.enableTwoFactor('pw')).toEqual({ totpUri: 'otpauth://totp/x?secret=ABC', backupCodes: ['a1', 'b2'] })
    await api.verifyTotp('123456')
    await api.verifyBackupCode('a1')
    await api.disableTwoFactor('pw')
    expect(client.twoFactor.enable).toHaveBeenCalledWith({ password: 'pw' })
    expect(client.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: '123456' })
    expect(client.twoFactor.verifyBackupCode).toHaveBeenCalledWith({ code: 'a1' })
    expect(client.twoFactor.disable).toHaveBeenCalledWith({ password: 'pw' })
  })

  it('reads whether the address is confirmed and the second factor is on', async () => {
    const { api } = fakeClient({ getSession: vi.fn((): Settled => ok({ user: { ...user, emailVerified: false, twoFactorEnabled: true }, session: {} })) })
    expect((await api.getSession())?.user).toMatchObject({ emailVerified: false, twoFactorEnabled: true })
  })

  it('turns Better Auth errors into translatable AppErrors', async () => {
    const { api } = fakeClient({ signIn: { email: vi.fn((): Settled => err(401, 'INVALID_EMAIL_OR_PASSWORD')) } })
    const failure = await api.signIn({ email: 'a@b.co', password: 'x' }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(AppError)
    expect((failure as AppError).key).toBe('errors.invalidCredentials')
    expect((failure as AppError).message).not.toContain('raw server text')
  })

  it('turns thrown network failures into the unreachable error', async () => {
    const { api } = fakeClient({ signOut: vi.fn((): Settled => Promise.reject(new Error('fetch failed'))) })
    await expect(api.signOut()).rejects.toMatchObject({ key: 'errors.unreachable' })
  })

  it('reads the session', async () => {
    const { api } = fakeClient()
    expect(await api.getSession()).toEqual({ user: { ...user, emailVerified: true, twoFactorEnabled: false }, activeOrganizationId: 'o1' })
  })

  it('returns null for an anonymous session and for a malformed one', async () => {
    expect(await fakeClient({ getSession: vi.fn((): Settled => ok(null)) }).api.getSession()).toBeNull()
    await expect(fakeClient({ getSession: vi.fn((): Settled => ok({ nope: true })) }).api.getSession()).rejects.toMatchObject({ key: 'errors.generic' })
  })

  it('creates an organization and activates it', async () => {
    const { organization, api } = fakeClient()
    expect(await api.createOrganization({ name: 'Acme', slug: 'acme' })).toEqual({ id: 'o1', name: 'Acme', slug: 'acme' })
    expect(organization.create).toHaveBeenCalledWith({ name: 'Acme', slug: 'acme' })
  })

  it('lists organizations and sets the active one', async () => {
    const { organization, api } = fakeClient()
    expect(await api.listOrganizations()).toEqual([{ id: 'o1', name: 'Acme', slug: 'acme' }])
    await api.setActiveOrganization('o1')
    expect(organization.setActive).toHaveBeenCalledWith({ organizationId: 'o1' })
  })

  it('reads the full organization with members and pending invitations only', async () => {
    const { organization, api } = fakeClient()
    organization.getFullOrganization.mockImplementationOnce(() =>
      ok({
        id: 'o1',
        name: 'Acme',
        slug: 'acme',
        members: [{ id: 'm1', userId: 'u1', role: 'owner', user }],
        invitations: [
          { id: 'i1', email: 'a@x.co', role: 'recruiter', status: 'pending', expiresAt: '2030-01-01T00:00:00.000Z' },
          { id: 'i0', email: 'b@x.co', role: 'admin', status: 'accepted', expiresAt: '2030-01-01T00:00:00.000Z' },
        ],
      }),
    )
    const full = await api.getFullOrganization()
    expect(full?.members).toEqual([{ id: 'm1', userId: 'u1', role: 'owner', name: 'Ada', email: 'ada@example.com' }])
    expect(full?.invitations).toEqual([{ id: 'i1', email: 'a@x.co', role: 'recruiter', expiresAt: '2030-01-01T00:00:00.000Z' }])
  })

  it('returns null when there is no active organization', async () => {
    const empty = fakeClient()
    empty.organization.getFullOrganization.mockImplementationOnce(() => ok(null))
    expect(await empty.api.getFullOrganization()).toBeNull()
  })

  it('invites and cancels with the Better Auth payloads', async () => {
    const { organization, api } = fakeClient()
    await api.inviteMember({ email: 'new@example.com', role: 'recruiter' })
    await api.cancelInvitation('i1')
    expect(organization.inviteMember).toHaveBeenCalledWith({ email: 'new@example.com', role: 'recruiter' })
    expect(organization.cancelInvitation).toHaveBeenCalledWith({ invitationId: 'i1' })
  })

  it('changes the role of a member', async () => {
    const { organization, api } = fakeClient()
    await api.updateMemberRole({ memberId: 'm2', role: 'hiring_manager' })
    expect(organization.updateMemberRole).toHaveBeenCalledWith({ memberId: 'm2', role: 'hiring_manager' })
  })

  it('reads, accepts and rejects an invitation', async () => {
    const { organization, api } = fakeClient()
    expect(await api.getInvitation('i1')).toMatchObject({ id: 'i1', organizationName: 'Acme', role: 'recruiter', status: 'pending' })
    expect(organization.getInvitation).toHaveBeenCalledWith({ query: { id: 'i1' } })
    await api.acceptInvitation('i1')
    await api.rejectInvitation('i1')
    expect(organization.acceptInvitation).toHaveBeenCalledWith({ invitationId: 'i1' })
    expect(organization.rejectInvitation).toHaveBeenCalledWith({ invitationId: 'i1' })
  })

  it('reports a missing invitation', async () => {
    const { organization, api } = fakeClient()
    organization.getInvitation.mockImplementationOnce(() => err(400, 'INVITATION_NOT_FOUND'))
    await expect(api.getInvitation('nope')).rejects.toMatchObject({ key: 'errors.invitationNotFound' })
  })
})
