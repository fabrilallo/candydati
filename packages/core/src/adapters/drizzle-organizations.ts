import { eq, schema } from '@tt/db';
import type { DbExecutor } from './db-executor.js';
import type { OrganizationDirectory } from '../job-ports.js';

/** Reads Better Auth's `organization` table. Exposes only what a public page needs. */
export function createDrizzleOrganizationDirectory(db: DbExecutor): OrganizationDirectory {
  const { organization } = schema;
  const find = async (where: ReturnType<typeof eq>) => {
    const [row] = await db
      .select({ id: organization.id, name: organization.name, slug: organization.slug, logo: organization.logo })
      .from(organization)
      .where(where)
      .limit(1);
    return row ?? null;
  };
  return {
    findBySlug: (slug) => find(eq(organization.slug, slug)),
    findById: (id) => find(eq(organization.id, id)),
  };
}
