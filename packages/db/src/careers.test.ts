import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, runMigrations, type DbHandle } from './index.js';
import { careersMedia, careersPage, organization } from './schema/index.js';
import { testDatabaseUrl } from './testing/test-database.js';

let handle: DbHandle;

const newOrganization = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};

const media = (organizationId: string, overrides: Partial<typeof careersMedia.$inferInsert> = {}): typeof careersMedia.$inferInsert => ({
  id: randomUUID(),
  organizationId,
  kind: 'image',
  mime: 'image/webp',
  sizeBytes: 1234,
  width: 1920,
  height: 1080,
  sha256: 'a'.repeat(64),
  widths: [640, 1280, 1920],
  createdBy: 'user_1',
  ...overrides,
});

describe('careers_page and careers_media', () => {
  beforeAll(async () => {
    const url = testDatabaseUrl();
    await runMigrations(url);
    handle = createDb(url);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('keeps one page per organization, draft required, published optional', async () => {
    const organizationId = await newOrganization();
    const draft = { version: 1 } as never;
    await handle.db.insert(careersPage).values({ organizationId, draft, draftUpdatedAt: new Date(), draftUpdatedBy: 'user_1' });
    const [row] = await handle.db.select().from(careersPage).where(eq(careersPage.organizationId, organizationId));
    expect(row).toMatchObject({ draft: { version: 1 }, published: null, publishedAt: null, revision: 0 });
    await expect(handle.db.insert(careersPage).values({ organizationId, draft, draftUpdatedAt: new Date(), draftUpdatedBy: 'user_2' })).rejects.toThrow();
  });

  it('refuses a page or a media file of an organization that does not exist', async () => {
    await expect(handle.db.insert(careersPage).values({ organizationId: randomUUID(), draft: {} as never, draftUpdatedAt: new Date(), draftUpdatedBy: 'u' })).rejects.toThrow();
    await expect(handle.db.insert(careersMedia).values(media(randomUUID()))).rejects.toThrow();
  });

  it('stores media with defaults for widths and alt, and checks the kind', async () => {
    const organizationId = await newOrganization();
    const row = media(organizationId, { widths: undefined, kind: 'video', mime: 'video/mp4', width: null, height: null });
    await handle.db.insert(careersMedia).values(row);
    const [stored] = await handle.db.select().from(careersMedia).where(and(eq(careersMedia.organizationId, organizationId), eq(careersMedia.id, row.id!)));
    expect(stored).toMatchObject({ kind: 'video', widths: [], alt: {}, width: null });
    expect(stored?.createdAt).toBeInstanceOf(Date);
    await expect(handle.db.insert(careersMedia).values(media(organizationId, { kind: 'audio' as never }))).rejects.toThrow();
  });

  it('scopes the media key by organization: the same id may exist in two organizations', async () => {
    const [first, second] = [await newOrganization(), await newOrganization()];
    const id = randomUUID();
    await handle.db.insert(careersMedia).values(media(first, { id }));
    await handle.db.insert(careersMedia).values(media(second, { id }));
    await expect(handle.db.insert(careersMedia).values(media(first, { id }))).rejects.toThrow();
  });
});
