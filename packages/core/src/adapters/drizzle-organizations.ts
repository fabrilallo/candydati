import { and, eq, schema } from '@candydati/db';
import { z } from 'zod';
import { logoFileOf } from '../mappers/logo.js';
import type { DbExecutor } from './db-executor.js';
import type { OrganizationDirectory } from '../job-ports.js';

const widthsSchema = z.array(z.number().int().positive());

/** Reads Better Auth's `organization` table, and the library image used as logo. Exposes only what a public page needs. */
export function createDrizzleOrganizationDirectory(db: DbExecutor): OrganizationDirectory {
  const { careersMedia, organization } = schema;
  const find = async (where: ReturnType<typeof eq>) => {
    const [row] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        logoMedia: { id: careersMedia.id, kind: careersMedia.kind, sha256: careersMedia.sha256, mime: careersMedia.mime, widths: careersMedia.widths },
      })
      .from(organization)
      .leftJoin(careersMedia, and(eq(careersMedia.organizationId, organization.id), eq(careersMedia.isLogo, true)))
      .where(where)
      .limit(1);
    if (!row) return null;
    const { logoMedia, ...rest } = row;
    return { ...rest, logoFile: logoMedia ? logoFileOf({ ...logoMedia, widths: widthsSchema.parse(logoMedia.widths) }) : null };
  };
  return {
    findBySlug: (slug) => find(eq(organization.slug, slug)),
    findById: (id) => find(eq(organization.id, id)),
  };
}
