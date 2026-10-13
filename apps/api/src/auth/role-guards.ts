import { isRole } from '@tt/domain';
import { APIError } from 'better-auth/api';

const assertDomainRole = (role: unknown): void => {
  if (!isRole(role)) throw new APIError('BAD_REQUEST', { message: 'Unknown role.' });
};

/**
 * Better Auth also accepts its own built-in `member` role and comma-separated role lists. The domain knows
 * exactly one role per member, so anything else is refused before it can be stored.
 */
export const roleGuardHooks = {
  beforeCreateInvitation: async (data: { invitation: { role: string } }): Promise<void> =>
    assertDomainRole(data.invitation.role),
  beforeAddMember: async (data: { member: { role: string } }): Promise<void> => assertDomainRole(data.member.role),
  beforeUpdateMemberRole: async (data: { newRole: string }): Promise<void> => assertDomainRole(data.newRole),
};
