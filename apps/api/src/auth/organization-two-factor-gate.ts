import { eq, schema, type Db } from '@tt/db';
import { roleNeedsTwoFactor } from '@tt/domain';
import { APIError, getSessionFromCtx } from 'better-auth/api';

/** Error code of a refused organization change; the web app translates it like the app's `two_factor_required`. */
export const TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED';

const ORGANIZATION_PREFIX = '/organization/';

/**
 * Organization endpoints that change nothing another member relies on, or that a person must be able to use before
 * enrolling: reads, choosing the active organization, answering one's own invitation, leaving, creating a new
 * organization (which has no requirement yet). Every other `/organization/*` endpoint is gated: a new endpoint of a
 * Better Auth release is gated until someone decides otherwise.
 */
const UNGATED: ReadonlySet<string> = new Set(
  [
    'create',
    'check-slug',
    'set-active',
    'accept-invitation',
    'reject-invitation',
    'leave',
    'list',
    'get-full-organization',
    'get-organization',
    'get-invitation',
    'list-invitations',
    'list-user-invitations',
    'list-members',
    'get-active-member',
    'get-active-member-role',
    'get-role',
    'list-roles',
    'list-teams',
    'list-team-members',
    'list-user-teams',
    'has-permission',
  ].map((name) => `${ORGANIZATION_PREFIX}${name}`),
);

export const isGatedOrganizationPath = (path: string): boolean => path.startsWith(ORGANIZATION_PREFIX) && !UNGATED.has(path);

export interface OrganizationGateLookups {
  roleOf(userId: string, organizationId: string): Promise<string | null>;
  requiresTwoFactor(organizationId: string): Promise<boolean>;
  /** The organization an invitation belongs to, or null. */
  organizationOfInvitation(invitationId: string): Promise<string | null>;
}

export interface GateSubject {
  readonly userId: string;
  readonly twoFactorEnabled: boolean;
  readonly activeOrganizationId: string | null;
}

const stringField = (body: unknown, key: string): string | null => {
  const value: unknown = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' && value !== '' ? value : null;
};

/** Every organization the request may act on: the one named, the invitation's and the active one. */
async function targetOrganizations(body: unknown, subject: GateSubject, lookups: OrganizationGateLookups): Promise<readonly string[]> {
  const invitationId = stringField(body, 'invitationId');
  const fromInvitation = invitationId === null ? null : await lookups.organizationOfInvitation(invitationId);
  const candidates = [stringField(body, 'organizationId'), fromInvitation, subject.activeOrganizationId];
  return [...new Set(candidates.filter((id): id is string => id !== null))];
}

/**
 * The same rule as the actor resolver of `/api/v1`: an owner or admin without 2FA, in an organization that requires
 * it, may not change that organization (members, roles, invitations, settings) through Better Auth either.
 */
export async function organizationChangeAllowed(path: string, body: unknown, subject: GateSubject | null, lookups: OrganizationGateLookups): Promise<boolean> {
  if (!isGatedOrganizationPath(path) || subject === null || subject.twoFactorEnabled) return true;
  for (const organizationId of await targetOrganizations(body, subject, lookups)) {
    const role = await lookups.roleOf(subject.userId, organizationId);
    if (roleNeedsTwoFactor(role) && (await lookups.requiresTwoFactor(organizationId))) return false;
  }
  return true;
}

/** The Better Auth `hooks.before` step: refuses with 403 TWO_FACTOR_REQUIRED, before the endpoint runs. */
export const organizationTwoFactorCheck = (lookups: OrganizationGateLookups) => async (ctx: Parameters<typeof getSessionFromCtx>[0]): Promise<void> => {
  if (!isGatedOrganizationPath(ctx.path)) return;
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // the endpoint itself answers 401
  const user = session.user as { id: string; twoFactorEnabled?: boolean | null };
  const active: unknown = (session.session as { activeOrganizationId?: unknown }).activeOrganizationId;
  const subject: GateSubject = { userId: user.id, twoFactorEnabled: user.twoFactorEnabled === true, activeOrganizationId: typeof active === 'string' ? active : null };
  if (await organizationChangeAllowed(ctx.path, ctx.body, subject, lookups)) return;
  throw new APIError('FORBIDDEN', { code: TWO_FACTOR_REQUIRED, message: 'This organization requires two-factor authentication for your role.' });
};

export const createOrganizationGateLookups = (db: Db, requiresTwoFactor: (organizationId: string) => Promise<boolean>, roleOf: OrganizationGateLookups['roleOf']): OrganizationGateLookups => ({
  roleOf,
  requiresTwoFactor,
  async organizationOfInvitation(invitationId) {
    const [row] = await db.select({ organizationId: schema.invitation.organizationId }).from(schema.invitation).where(eq(schema.invitation.id, invitationId)).limit(1);
    return row?.organizationId ?? null;
  },
});
