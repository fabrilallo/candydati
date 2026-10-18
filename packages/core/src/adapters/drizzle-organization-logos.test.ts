import { randomUUID } from 'node:crypto';
import { createDb, eq, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CareersMediaRecord } from '../careers-ports.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleCareersMedia } from './drizzle-careers.js';
import { createDrizzleOrganizationLogos } from './drizzle-organization-logos.js';
import { createDrizzleOrganizationDirectory } from './drizzle-organizations.js';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

const newOrganization = async (logo: string | null = null): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, logo, createdAt: new Date() });
  return id;
};

const image = (organizationId: string, overrides: Partial<CareersMediaRecord> = {}): CareersMediaRecord => ({
  id: randomUUID(),
  organizationId,
  kind: 'image',
  mime: 'image/webp',
  sizeBytes: 42,
  width: 1280,
  height: 720,
  sha256: 'a'.repeat(64),
  widths: [640, 1280],
  alt: {},
  createdBy: 'user_1',
  createdAt: new Date('2026-06-01T10:00:00Z'),
  ...overrides,
});

const storedLogo = async (organizationId: string): Promise<string | null> => {
  const [row] = await handle.db.select({ logo: schema.organization.logo }).from(schema.organization).where(eq(schema.organization.id, organizationId));
  return row?.logo ?? null;
};

describe('drizzle organization logos', () => {
  it('reads the address Better Auth stored, and nothing for an organization without a logo', async () => {
    const logos = createDrizzleOrganizationLogos(handle.db);
    expect(await logos.find(await newOrganization('https://cdn.example/l.png'))).toEqual({ kind: 'url', url: 'https://cdn.example/l.png' });
    expect(await logos.find(await newOrganization())).toBeNull();
  });

  it('switches between a library image and an address, keeping one source at a time', async () => {
    const organizationId = await newOrganization('https://cdn.example/old.png');
    const media = createDrizzleCareersMedia(handle.db);
    const first = await media.insert(image(organizationId));
    const second = await media.insert(image(organizationId));
    const logos = createDrizzleOrganizationLogos(handle.db);

    await logos.set(organizationId, { kind: 'media', mediaId: first.id });
    expect(await logos.find(organizationId)).toEqual({ kind: 'media', mediaId: first.id });
    expect(await storedLogo(organizationId)).toBeNull();

    await logos.set(organizationId, { kind: 'media', mediaId: second.id });
    expect(await logos.find(organizationId)).toEqual({ kind: 'media', mediaId: second.id });

    await logos.set(organizationId, { kind: 'url', url: 'https://cdn.example/new.png' });
    expect(await logos.find(organizationId)).toEqual({ kind: 'url', url: 'https://cdn.example/new.png' });

    await logos.set(organizationId, null);
    expect(await logos.find(organizationId)).toBeNull();
    expect(await storedLogo(organizationId)).toBeNull();
  });

  it('never flags an image of another organization', async () => {
    const organizationId = await newOrganization();
    const other = await newOrganization();
    const foreign = await createDrizzleCareersMedia(handle.db).insert(image(other));
    const logos = createDrizzleOrganizationLogos(handle.db);
    await expect(logos.set(organizationId, { kind: 'media', mediaId: foreign.id })).rejects.toThrow(/not in the organization/);
    expect(await logos.find(organizationId)).toBeNull();
    expect(await logos.find(other)).toBeNull();
  });
});

describe('drizzle organization directory logo', () => {
  it('names the smallest stored width of the library image, which wins over the address', async () => {
    const organizationId = await newOrganization('https://cdn.example/l.png');
    const directory = createDrizzleOrganizationDirectory(handle.db);
    expect((await directory.findById(organizationId))?.logoFile).toBeNull();
    const logo = await createDrizzleCareersMedia(handle.db).insert(image(organizationId, { sha256: 'b'.repeat(64) }));
    await createDrizzleOrganizationLogos(handle.db).set(organizationId, { kind: 'media', mediaId: logo.id });
    const found = await directory.findBySlug(organizationId);
    expect(found).toEqual({ id: organizationId, name: organizationId, slug: organizationId, logo: null, logoFile: { mediaId: logo.id, fileName: `${'b'.repeat(16)}-w640.webp` } });
  });
});
