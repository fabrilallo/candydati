import { createDrizzleCareersPages, createDrizzleOrganizationSettings, createDrizzlePrivacyNotices } from '@candydati/core';
import { asc, eq, or, schema, type Db } from '@candydati/db';
import type { CareersPageDocument, PrivacyNotice } from '@candydati/domain';
import { isDeepStrictEqual } from 'node:util';
import type { SingletonPlan } from '../plan.js';

export class DemoSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoSeedError';
  }
}

export interface DemoTarget {
  readonly organization: { readonly id: string; readonly name: string; readonly slug: string };
  readonly owner: { readonly id: string; readonly name: string; readonly email: string };
  /** The active notice, or null when the organization never published one. */
  readonly notice: PrivacyNotice | null;
  readonly careersRevision: number;
  readonly careersPublished: CareersPageDocument | null;
  readonly careersDraft: CareersPageDocument | null;
  readonly recruitsForClients: boolean;
  readonly agencyAuthorization: string | null;
}

const isOwner = (role: string): boolean => role.split(',').map((part) => part.trim()).includes('owner');

/** One organization, by slug or id. Never more: the seed refuses to guess. */
async function findOrganization(db: Db, ref: string): Promise<DemoTarget['organization']> {
  const { organization } = schema;
  const rows = await db.select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).where(or(eq(organization.slug, ref), eq(organization.id, ref))).limit(2);
  const [found] = rows;
  if (found === undefined) throw new DemoSeedError(`No organization with slug or id "${ref}".`);
  if (rows.length > 1) throw new DemoSeedError(`"${ref}" matches more than one organization: use its id.`);
  return found;
}

/** The first owner: the demo's jobs, notes and tasks are theirs. */
async function findOwner(db: Db, organizationId: string): Promise<DemoTarget['owner']> {
  const { member, user } = schema;
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt));
  const owner = rows.find((row) => isOwner(row.role));
  if (owner === undefined) throw new DemoSeedError('The organization has no owner to act as.');
  return { id: owner.id, name: owner.name, email: owner.email };
}

/** Where the organization stands today, read through the product's own repositories. */
export async function loadTarget(db: Db, ref: string): Promise<DemoTarget> {
  const organization = await findOrganization(db, ref);
  const owner = await findOwner(db, organization.id);
  const notice = await createDrizzlePrivacyNotices(db).findActive(organization.id);
  const page = await createDrizzleCareersPages(db).find(organization.id);
  const settings = await createDrizzleOrganizationSettings(db).get(organization.id);
  return {
    organization,
    owner,
    notice,
    careersRevision: page?.revision ?? 0,
    careersPublished: page?.published ?? null,
    careersDraft: page?.draft ?? null,
    recruitsForClients: settings.recruitsForClients,
    agencyAuthorization: settings.agencyAuthorization,
  };
}

/** What happens to the notice, the careers page and the agency switch. */
export const singletonPlan = (target: DemoTarget, careersPage: CareersPageDocument): SingletonPlan => {
  const sameAsDemo = isDeepStrictEqual(target.careersPublished, careersPage) && isDeepStrictEqual(target.careersDraft, careersPage);
  return {
    privacyNotice: target.notice === null ? 'create' : 'keep',
    careersPage: target.careersRevision === 0 ? 'create' : sameAsDemo ? 'unchanged' : 'replace',
    agency: target.recruitsForClients ? 'unchanged' : 'enable',
  };
};
