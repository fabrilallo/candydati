import { httpUrlOrNull, isRole } from '@candydati/domain';
import { APIError } from 'better-auth/api';

const assertDomainRole = (role: unknown): void => {
  if (!isRole(role)) throw new APIError('BAD_REQUEST', { message: 'Unknown role.' });
};

/** The logo is rendered as an image address on public pages: https only. */
const assertLogo = (data: { organization: { logo?: string | null } }): void => {
  const logo = data.organization.logo;
  if (logo === undefined || logo === null || logo === '') return;
  if (httpUrlOrNull(logo, { httpsOnly: true }) === null) throw new APIError('BAD_REQUEST', { message: 'The logo must be an https URL.' });
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
  beforeCreateOrganization: async (data: { organization: { logo?: string | null } }): Promise<void> => assertLogo(data),
  beforeUpdateOrganization: async (data: { organization: { logo?: string | null } }): Promise<void> => assertLogo(data),
};
