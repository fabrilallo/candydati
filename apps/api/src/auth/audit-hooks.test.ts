import { createInMemoryAuditLog, createInMemoryTransaction, failingAuditLog, type InMemoryAuditLog } from '@tt/core/testing';
import { describe, expect, it } from 'vitest';
import { createAuditHooks, type ActorLookups } from './audit-hooks.js';

const ORG = { id: 'org1', name: 'Acme', slug: 'acme' };
const ROLES_BY_USER: Record<string, string> = { admin1: 'admin', owner1: 'owner', rec1: 'recruiter' };

const lookups = (currentUserId: string | null): ActorLookups => ({
  currentUserId: async () => currentUserId,
  roleOf: async (userId) => ROLES_BY_USER[userId] ?? null,
});

const setup = (currentUserId: string | null = 'owner1', auditLog: InMemoryAuditLog = createInMemoryAuditLog()) => ({
  auditLog,
  hooks: createAuditHooks({ core: { auditLog, transaction: createInMemoryTransaction() }, lookups: lookups(currentUserId) }),
});

const member = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1',
  organizationId: 'org1',
  userId: 'rec1',
  role: 'recruiter',
  createdAt: new Date(),
  ...overrides,
});
const user = (id: string) => ({ id, name: id, email: `${id}@example.com` });
const invitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv1',
  organizationId: 'org1',
  email: 'b@example.com',
  role: 'recruiter',
  status: 'pending',
  inviterId: 'owner1',
  expiresAt: new Date(),
  ...overrides,
});

describe('audit hooks', () => {
  it('records organization.created with the creator as actor', async () => {
    const { hooks, auditLog } = setup('owner1');
    await hooks.afterCreateOrganization({ organization: ORG, member: member({ userId: 'owner1', role: 'owner' }), user: user('owner1') } as never);
    expect(auditLog.events()).toEqual([
      expect.objectContaining({
        action: 'organization.created',
        organizationId: 'org1',
        actor: { type: 'user', id: 'owner1', onBehalfOfUserId: null },
        target: { type: 'organization', id: 'org1' },
        metadata: { name: 'Acme', slug: 'acme' },
      }),
    ]);
  });

  it('records organization.updated, also when the adapter returns no organization', async () => {
    const { hooks, auditLog } = setup();
    await hooks.afterUpdateOrganization({ organization: ORG, member: member({ userId: 'admin1', role: 'admin' }), user: user('admin1') } as never);
    await hooks.afterUpdateOrganization({ organization: null, member: member({ userId: 'admin1', role: 'admin' }), user: user('admin1') } as never);
    expect(auditLog.events().map((e) => [e.action, e.target.id, e.actor.id])).toEqual([
      ['organization.updated', 'org1', 'admin1'],
      ['organization.updated', 'org1', 'admin1'],
    ]);
  });

  it('records invitation.created with email and role, actor looked up by role', async () => {
    const { hooks, auditLog } = setup();
    await hooks.afterCreateInvitation({ invitation: invitation(), inviter: user('admin1'), organization: ORG } as never);
    expect(auditLog.events()).toEqual([
      expect.objectContaining({
        action: 'invitation.created',
        actor: { type: 'user', id: 'admin1', onBehalfOfUserId: null },
        target: { type: 'invitation', id: 'inv1' },
        metadata: { email: 'b@example.com', role: 'recruiter' },
      }),
    ]);
  });

  it('records invitation.accepted and member.added by the accepting user', async () => {
    const { hooks, auditLog } = setup('rec1');
    await hooks.afterAcceptInvitation({ invitation: invitation(), member: member(), user: user('rec1'), organization: ORG } as never);
    expect(auditLog.events().map((e) => [e.action, e.actor.id, e.target])).toEqual([
      ['invitation.accepted', 'rec1', { type: 'invitation', id: 'inv1' }],
      ['member.added', 'rec1', { type: 'member', id: 'm1' }],
    ]);
    expect(auditLog.events()[1]!.metadata).toEqual({ role: 'recruiter', invitationId: 'inv1' });
  });

  it('records invitation.rejected by the invitee, with the invited role as the actor role', async () => {
    const { hooks, auditLog } = setup('rec1');
    await hooks.afterRejectInvitation({ invitation: invitation(), user: user('rec1'), organization: ORG } as never);
    expect(auditLog.events()).toEqual([
      expect.objectContaining({ action: 'invitation.rejected', actor: { type: 'user', id: 'rec1', onBehalfOfUserId: null } }),
    ]);
  });

  it('records invitation.cancelled by whoever cancelled', async () => {
    const { hooks, auditLog } = setup();
    await hooks.afterCancelInvitation({ invitation: invitation(), cancelledBy: user('admin1'), organization: ORG } as never);
    expect(auditLog.events()).toEqual([
      expect.objectContaining({
        action: 'invitation.cancelled',
        actor: expect.objectContaining({ id: 'admin1' }),
        metadata: { email: 'b@example.com', role: 'recruiter' },
      }),
    ]);
  });

  it('records member.added for the founding owner and for a server-side add', async () => {
    const { hooks, auditLog } = setup('owner1');
    await hooks.afterAddMember({ member: member({ userId: 'owner1', role: 'owner' }), user: user('owner1'), organization: ORG } as never);
    expect(auditLog.events()[0]).toMatchObject({ action: 'member.added', actor: { id: 'owner1' }, metadata: { role: 'owner' } });
  });

  it('records member.role_changed with the acting user, not the changed member', async () => {
    const { hooks, auditLog } = setup('owner1');
    await hooks.afterUpdateMemberRole({ member: member({ role: 'admin' }), previousRole: 'recruiter', user: user('rec1'), organization: ORG } as never);
    expect(auditLog.events()).toEqual([
      expect.objectContaining({
        action: 'member.role_changed',
        actor: { type: 'user', id: 'owner1', onBehalfOfUserId: null },
        target: { type: 'member', id: 'm1' },
        metadata: { previousRole: 'recruiter', role: 'admin' },
      }),
    ]);
  });

  it('records member.removed by the remover, or by the member who left', async () => {
    const removedByOwner = setup('owner1');
    await removedByOwner.hooks.afterRemoveMember({ member: member(), user: user('rec1'), organization: ORG } as never);
    expect(removedByOwner.auditLog.events()[0]).toMatchObject({ action: 'member.removed', actor: { id: 'owner1' }, metadata: { role: 'recruiter' } });

    const left = setup('rec1');
    await left.hooks.afterRemoveMember({ member: member(), user: user('rec1'), organization: ORG } as never);
    expect(left.auditLog.events()[0]).toMatchObject({ actor: { id: 'rec1' } });
  });

  it('falls back to a system actor outside an HTTP request', async () => {
    const { hooks, auditLog } = setup(null);
    await hooks.afterRemoveMember({ member: member(), user: user('rec1'), organization: ORG } as never);
    expect(auditLog.events()[0]!.actor).toEqual({ type: 'system', id: null, onBehalfOfUserId: null });
  });

  it('uses the least privileged role when a stored role is not a domain role', async () => {
    const { hooks, auditLog } = setup('ghost');
    await hooks.afterRemoveMember({ member: member(), user: user('rec1'), organization: ORG } as never);
    expect(auditLog.events()).toHaveLength(1);
  });

  it('surfaces a failing audit log instead of hiding it', async () => {
    const { hooks } = setup('owner1', failingAuditLog(new Error('db down')));
    await expect(
      hooks.afterRemoveMember({ member: member(), user: user('rec1'), organization: ORG } as never),
    ).rejects.toMatchObject({ code: 'audit_failed' });
  });
});
