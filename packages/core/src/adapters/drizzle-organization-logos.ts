import { and, eq, schema } from '@candydati/db';
import type { OrganizationLogoStore } from '../careers-ports.js';
import type { DbExecutor } from './db-executor.js';

/**
 * The logo lives in two places: the flag on a careers library image, or Better Auth's `organization.logo` (an address).
 * Every change writes both in one transaction (a savepoint inside the use case's), so only one source is ever set.
 */
export function createDrizzleOrganizationLogos(db: DbExecutor): OrganizationLogoStore {
  const { careersMedia, organization } = schema;
  return {
    async find(organizationId) {
      const [image] = await db
        .select({ id: careersMedia.id })
        .from(careersMedia)
        .where(and(eq(careersMedia.organizationId, organizationId), eq(careersMedia.isLogo, true)))
        .limit(1);
      if (image) return { kind: 'media', mediaId: image.id };
      const [row] = await db.select({ logo: organization.logo }).from(organization).where(eq(organization.id, organizationId)).limit(1);
      return row?.logo ? { kind: 'url', url: row.logo } : null;
    },
    async set(organizationId, source) {
      await db.transaction(async (tx) => {
        const inOrganization = eq(careersMedia.organizationId, organizationId);
        await tx.update(careersMedia).set({ isLogo: false }).where(and(inOrganization, eq(careersMedia.isLogo, true)));
        await tx.update(organization).set({ logo: source?.kind === 'url' ? source.url : null }).where(eq(organization.id, organizationId));
        if (source?.kind !== 'media') return;
        const flagged = await tx
          .update(careersMedia)
          .set({ isLogo: true })
          .where(and(inOrganization, eq(careersMedia.id, source.mediaId)))
          .returning({ id: careersMedia.id });
        if (flagged.length === 0) throw new Error('The logo image is not in the organization.');
      });
    },
  };
}
