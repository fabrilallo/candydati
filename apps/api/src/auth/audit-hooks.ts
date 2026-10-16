import { recordAuditEvent, type Actor, type CoreDeps } from '@candydati/core';
import { isRole, type AuditAction, type AuditTarget, type Role } from '@candydati/domain';

/** Who is acting. Both lookups are answered from the request that triggered the hook. */
export interface ActorLookups {
  /** The signed-in user of the current request, or null outside an HTTP request. */
  currentUserId(): Promise<string | null>;
  /** The user's raw role in the organization, or null when they are not a member. */
  roleOf(userId: string, organizationId: string): Promise<string | null>;
}

export interface AuditHookDeps {
  readonly core: CoreDeps;
  readonly lookups: ActorLookups;
}

/** Role used when a stored role is unreadable: the audit record is still written, with no extra privilege. */
const FALLBACK_ROLE: Role = 'interviewer';
const SYSTEM_ROLE: Role = 'owner';

const toRole = (value: string | null | undefined): Role => (isRole(value) ? value : FALLBACK_ROLE);

interface Organization {
  readonly id: string;
  readonly name?: string;
  readonly slug?: string;
}
interface MemberLike {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: string;
}
interface InvitationLike {
  readonly id: string;
  readonly organizationId: string;
  readonly email: string;
  readonly role?: string | null;
}
interface UserLike {
  readonly id: string;
}

const userActor = (id: string, organizationId: string, role: Role): Actor => ({
  type: 'user',
  id,
  organizationId,
  role,
  onBehalfOfUserId: null,
});

type RecordableAction = Exclude<AuditAction, 'audit.read'>;

interface Recorded {
  readonly organizationId: string;
  readonly action: RecordableAction;
  readonly target: AuditTarget;
  readonly metadata: Record<string, unknown>;
}

/**
 * Better Auth organization hooks that write the audit trail through core's `recordAuditEvent`.
 * Each hook records the action of its own name; accepting an invitation also records the resulting member.
 */
export function createAuditHooks({ core, lookups }: AuditHookDeps) {
  const helpers = createHookHelpers(core, lookups);
  return { ...organizationHooks(helpers), ...invitationHooks(helpers, lookups), ...memberHooks(helpers) };
}

function createHookHelpers(core: CoreDeps, lookups: AuditHookDeps['lookups']) {
  const record = (actor: Actor, event: Recorded): Promise<unknown> => recordAuditEvent(core, actor, event);

  const log = (actor: Actor, action: RecordableAction, target: AuditTarget, metadata: Record<string, unknown> = {}) =>
    record(actor, { organizationId: actor.organizationId, action, target, metadata });

  /** The person who did it: the request's user, whose role is read from the organization. */
  const actingActor = async (organizationId: string, ownRole?: { userId: string; role: string }): Promise<Actor> => {
    const userId = await lookups.currentUserId();
    if (userId === null) return { type: 'system', id: null, organizationId, role: SYSTEM_ROLE, onBehalfOfUserId: null };
    if (ownRole?.userId === userId) return userActor(userId, organizationId, toRole(ownRole.role));
    return userActor(userId, organizationId, toRole(await lookups.roleOf(userId, organizationId)));
  };

  const memberTarget = (member: MemberLike) => ({ type: 'member', id: member.id });
  const invitationTarget = (invitation: InvitationLike) => ({ type: 'invitation', id: invitation.id });
  const invitationMeta = (invitation: InvitationLike) => ({ email: invitation.email, role: invitation.role ?? null });
  return { log, actingActor, memberTarget, invitationTarget, invitationMeta };
}

type HookHelpers = ReturnType<typeof createHookHelpers>;

function organizationHooks({ log }: HookHelpers) {
  return {
    afterCreateOrganization: async (data: { organization: Organization; member: MemberLike; user: UserLike }) =>
      void (await log(
        userActor(data.user.id, data.organization.id, toRole(data.member.role)),
        'organization.created',
        { type: 'organization', id: data.organization.id },
        { name: data.organization.name, slug: data.organization.slug },
      )),

    afterUpdateOrganization: async (data: { organization: Organization | null; member: MemberLike; user: UserLike }) =>
      void (await log(
        userActor(data.user.id, data.member.organizationId, toRole(data.member.role)),
        'organization.updated',
        { type: 'organization', id: data.member.organizationId },
        data.organization ? { name: data.organization.name, slug: data.organization.slug } : {},
      )),
  };
}

function invitationHooks({ log, invitationTarget, invitationMeta, memberTarget }: HookHelpers, lookups: AuditHookDeps['lookups']) {
  return {
    afterCreateInvitation: async (data: { invitation: InvitationLike; inviter: UserLike; organization: Organization }) =>
      void (await log(
        userActor(data.inviter.id, data.organization.id, toRole(await lookups.roleOf(data.inviter.id, data.organization.id))),
        'invitation.created',
        invitationTarget(data.invitation),
        invitationMeta(data.invitation),
      )),

    afterAcceptInvitation: async (data: { invitation: InvitationLike; member: MemberLike; user: UserLike; organization: Organization }) => {
      const actor = userActor(data.user.id, data.organization.id, toRole(data.member.role));
      await log(actor, 'invitation.accepted', invitationTarget(data.invitation), { role: data.member.role });
      await log(actor, 'member.added', memberTarget(data.member), { role: data.member.role, invitationId: data.invitation.id });
    },

    afterRejectInvitation: async (data: { invitation: InvitationLike; user: UserLike; organization: Organization }) =>
      void (await log(
        userActor(data.user.id, data.organization.id, toRole(data.invitation.role)),
        'invitation.rejected',
        invitationTarget(data.invitation),
        invitationMeta(data.invitation),
      )),

    afterCancelInvitation: async (data: { invitation: InvitationLike; cancelledBy: UserLike; organization: Organization }) =>
      void (await log(
        userActor(data.cancelledBy.id, data.organization.id, toRole(await lookups.roleOf(data.cancelledBy.id, data.organization.id))),
        'invitation.cancelled',
        invitationTarget(data.invitation),
        invitationMeta(data.invitation),
      )),
  };
}

function memberHooks({ log, actingActor, memberTarget }: HookHelpers) {
  return {
    afterAddMember: async (data: { member: MemberLike; user: UserLike; organization: Organization }) =>
      void (await log(
        await actingActor(data.organization.id, { userId: data.user.id, role: data.member.role }),
        'member.added',
        memberTarget(data.member),
        { role: data.member.role },
      )),

    afterUpdateMemberRole: async (data: { member: MemberLike; previousRole: string; user: UserLike; organization: Organization }) =>
      void (await log(
        await actingActor(data.organization.id),
        'member.role_changed',
        memberTarget(data.member),
        { previousRole: data.previousRole, role: data.member.role },
      )),

    afterRemoveMember: async (data: { member: MemberLike; user: UserLike; organization: Organization }) =>
      void (await log(
        await actingActor(data.organization.id, { userId: data.member.userId, role: data.member.role }),
        'member.removed',
        memberTarget(data.member),
        { role: data.member.role },
      )),
  };
}
