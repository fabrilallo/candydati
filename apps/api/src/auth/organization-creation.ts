import { and, eq, gte, isNotNull, or, schema, sql, type Db } from '@candydati/db';
import { APIError } from 'better-auth/api';
import type { OrganizationCreationMode } from '../config/env.js';

/** Better Auth's own code for a refused creation: the web app already translates it. */
export const CREATION_REFUSED = 'YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION';
/** A claimed slot whose organization was never created (the creation failed after the claim) lapses after this long. */
export const CREATION_CLAIM_TTL_MS = 5 * 60 * 1000;

export interface OrganizationCreationPolicy {
  readonly mode: OrganizationCreationMode;
  /** INSTANCE_ADMIN_EMAILS, lower case. */
  readonly instanceAdmins: readonly string[];
}

type CreationUser = { readonly id: string; readonly email: string };

export interface OrganizationCreationLookups {
  /** The account created an organization, or is creating one right now. */
  creationSlotTaken(userId: string, now: Date): Promise<boolean>;
  /** Takes the account's one_per_user slot. Atomic: of concurrent claims exactly one wins. */
  claimCreationSlot(userId: string, now: Date): Promise<boolean>;
  /** Records the organization an account created (its first one, if it already has a record). */
  recordCreation(userId: string, organizationId: string, now: Date): Promise<void>;
  /** The first owner of the instance: the bootstrap owner, or the oldest confirmed account on older installs. */
  firstOwnerId(): Promise<string | null>;
}

const isInstanceAdmin = (policy: OrganizationCreationPolicy, user: CreationUser): boolean =>
  policy.instanceAdmins.includes(user.email.trim().toLowerCase());

/** Only `one_per_user` counts creations, and never for an instance admin. */
const limitedToOne = (policy: OrganizationCreationPolicy, user: CreationUser): boolean =>
  policy.mode === 'one_per_user' && !isInstanceAdmin(policy, user);

/**
 * Better Auth's `allowUserToCreateOrganization`. Every organization gets its own model budgets, so unlimited creation
 * would multiply them: `one_per_user` (default when invite only) lets each account create one organization ever,
 * `instance_admins` lets only the first owner and INSTANCE_ADMIN_EMAILS create any. Instance admins are never limited.
 * A cheap pre-check: what enforces `one_per_user` is the atomic claim of `organizationCreationHooks`.
 */
export async function organizationCreationAllowed(
  policy: OrganizationCreationPolicy,
  user: CreationUser,
  lookups: OrganizationCreationLookups,
  now: Date,
): Promise<boolean> {
  if (policy.mode === 'open' || isInstanceAdmin(policy, user)) return true;
  if (policy.mode === 'one_per_user') return !(await lookups.creationSlotTaken(user.id, now));
  return (await lookups.firstOwnerId()) === user.id;
}

/**
 * Organization hooks that enforce `one_per_user`: the slot is claimed before the organization is created (two
 * concurrent creations cannot both pass) and is kept whatever role the account holds later.
 */
export const organizationCreationHooks = (policy: OrganizationCreationPolicy, lookups: OrganizationCreationLookups, now: () => Date = () => new Date()) => ({
  beforeCreateOrganization: async (data: { user: CreationUser }): Promise<void> => {
    if (!limitedToOne(policy, data.user) || (await lookups.claimCreationSlot(data.user.id, now()))) return;
    throw new APIError('FORBIDDEN', { code: CREATION_REFUSED, message: 'You are not allowed to create a new organization.' });
  },
  afterCreateOrganization: async (data: { organization: { id: string }; user: CreationUser }): Promise<void> =>
    lookups.recordCreation(data.user.id, data.organization.id, now()),
});

const quota = schema.organizationCreationQuota;
/** A slot is taken by a created organization or by a claim still within its lifetime. */
const slotTaken = (now: Date) => or(isNotNull(quota.organizationId), gte(quota.claimedAt, new Date(now.getTime() - CREATION_CLAIM_TTL_MS)));

export const createOrganizationCreationLookups = (db: Db): OrganizationCreationLookups => ({
  async creationSlotTaken(userId, now) {
    const rows = await db.select({ userId: quota.userId }).from(quota).where(and(eq(quota.userId, userId), slotTaken(now))).limit(1);
    return rows.length > 0;
  },
  async claimCreationSlot(userId, now) {
    // Conflicting claims wait on the row lock and re-check the condition against the winner's row: one returns a row.
    const rows = await db
      .insert(quota)
      .values({ userId, claimedAt: now })
      .onConflictDoUpdate({ target: quota.userId, set: { claimedAt: now }, setWhere: sql`not (${slotTaken(now)})` })
      .returning({ userId: quota.userId });
    return rows.length > 0;
  },
  async recordCreation(userId, organizationId, now) {
    await db
      .insert(quota)
      .values({ userId, organizationId, claimedAt: now })
      .onConflictDoUpdate({ target: quota.userId, set: { organizationId }, setWhere: sql`${quota.organizationId} is null` });
  },
  async firstOwnerId() {
    const [bootstrap] = await db.select({ ownerUserId: schema.instanceBootstrap.ownerUserId }).from(schema.instanceBootstrap).limit(1);
    if (bootstrap) return bootstrap.ownerUserId;
    // Installs without a bootstrap record (open sign-up, or older releases): the oldest confirmed account.
    const [row] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.emailVerified, true)).orderBy(schema.user.createdAt).limit(1);
    return row?.id ?? null;
  },
});
