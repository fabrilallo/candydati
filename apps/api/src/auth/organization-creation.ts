import { and, asc, eq, schema, type Db } from '@tt/db';
import { CREATOR_ROLE } from '@tt/domain';
import type { OrganizationCreationMode } from '../config/env.js';

export interface OrganizationCreationPolicy {
  readonly mode: OrganizationCreationMode;
  /** INSTANCE_ADMIN_EMAILS, lower case. */
  readonly instanceAdmins: readonly string[];
}

export interface OrganizationCreationLookups {
  /** The person is the owner of at least one organization. */
  ownsAnOrganization(userId: string): Promise<boolean>;
  /** The first owner of the instance: its oldest confirmed account. */
  firstOwnerId(): Promise<string | null>;
}

/**
 * Better Auth's `allowUserToCreateOrganization`. Every organization gets its own model budgets, so unlimited creation
 * would multiply them: `one_per_user` (default when invite only) lets each person create one, `instance_admins` lets only
 * the first owner and INSTANCE_ADMIN_EMAILS create any. Instance admins are never limited.
 */
export async function organizationCreationAllowed(
  policy: OrganizationCreationPolicy,
  user: { readonly id: string; readonly email: string },
  lookups: OrganizationCreationLookups,
): Promise<boolean> {
  if (policy.mode === 'open' || policy.instanceAdmins.includes(user.email.trim().toLowerCase())) return true;
  if (policy.mode === 'one_per_user') return !(await lookups.ownsAnOrganization(user.id));
  return (await lookups.firstOwnerId()) === user.id;
}

export const createOrganizationCreationLookups = (db: Db): OrganizationCreationLookups => ({
  async ownsAnOrganization(userId) {
    const rows = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(and(eq(schema.member.userId, userId), eq(schema.member.role, CREATOR_ROLE)))
      .limit(1);
    return rows.length > 0;
  },
  async firstOwnerId() {
    const [row] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.emailVerified, true)).orderBy(asc(schema.user.createdAt)).limit(1);
    return row?.id ?? null;
  },
});
