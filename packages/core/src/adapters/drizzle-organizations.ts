import { eq, schema, type Db } from '@tt/db';
import type { OrganizationDirectory } from '../job-ports.js';

/** Reads Better Auth's `organization` table. Exposes only what a public page needs. */
export function createDrizzleOrganizationDirectory(db: Db): OrganizationDirectory {
  const { organization } = schema;
  return {
    async findBySlug(slug) {
      const [row] = await db
        .select({ id: organization.id, name: organization.name, slug: organization.slug, logo: organization.logo })
        .from(organization)
        .where(eq(organization.slug, slug))
        .limit(1);
      return row ?? null;
    },
  };
}
