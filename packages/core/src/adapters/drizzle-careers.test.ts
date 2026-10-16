import { randomUUID } from 'node:crypto';
import { careersPageDocumentSchema, careersPageFixture, defaultCareersPage } from '@candydati/domain';
import { createDb, eq, schema, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CareersMediaRecord } from '../careers-ports.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { createDrizzleCareersMedia, createDrizzleCareersPages } from './drizzle-careers.js';

let handle: DbHandle;
const AT = new Date('2026-06-01T10:00:00Z');

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 2);
});
afterAll(async () => {
  await handle.close();
});

const newOrganization = async (): Promise<string> => {
  const id = randomUUID();
  await handle.db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() });
  return id;
};

const media = (organizationId: string, overrides: Partial<CareersMediaRecord> = {}): CareersMediaRecord => ({
  id: randomUUID(),
  organizationId,
  kind: 'image',
  mime: 'image/webp',
  sizeBytes: 42,
  width: 1280,
  height: 720,
  sha256: 'e'.repeat(64),
  widths: [640, 1280],
  alt: { it: 'Ufficio' },
  createdBy: 'user_1',
  createdAt: AT,
  ...overrides,
});

describe('drizzle careers pages', () => {
  it('saves a draft, publishes it, and reads both back validated', async () => {
    const organizationId = await newOrganization();
    const pages = createDrizzleCareersPages(handle.db);
    expect(await pages.find(organizationId)).toBeNull();
    const draft = careersPageDocumentSchema.parse(careersPageFixture());
    const saved = await pages.saveDraft(organizationId, draft, AT, 'user_1', 0);
    expect(saved).toMatchObject({ organizationId, published: null, publishedAt: null, revision: 1 });
    expect(saved?.draft).toEqual(draft);
    const later = new Date('2026-06-02T10:00:00Z');
    const published = await pages.publish(organizationId, draft, later, 'user_2', 1);
    expect(published).toMatchObject({ publishedAt: later, draftUpdatedAt: later, revision: 2 });
    expect(published?.published).toEqual(draft);
    const next = defaultCareersPage('Acme');
    const redrafted = await pages.saveDraft(organizationId, next, later, 'user_1', 2);
    expect(redrafted?.draft).toEqual(next);
    expect(redrafted?.published).toEqual(draft);
  });

  it('writes nothing over a stale revision, also when two first saves race', async () => {
    const organizationId = await newOrganization();
    const pages = createDrizzleCareersPages(handle.db);
    const draft = defaultCareersPage('Acme');
    const [a, b] = await Promise.all([pages.saveDraft(organizationId, draft, AT, 'a', 0), pages.saveDraft(organizationId, draft, AT, 'b', 0)]);
    expect([a, b].filter((record) => record !== null)).toHaveLength(1);
    expect(await pages.saveDraft(organizationId, draft, AT, 'c', 0)).toBeNull();
    expect(await pages.publish(organizationId, draft, AT, 'c', 7)).toBeNull();
    expect((await pages.find(organizationId))?.revision).toBe(1);
  });

  it('refuses to store an invalid document', async () => {
    const organizationId = await newOrganization();
    const pages = createDrizzleCareersPages(handle.db);
    await expect(pages.saveDraft(organizationId, { version: 1 } as never, AT, 'u', 0)).rejects.toThrow();
    expect(await pages.find(organizationId)).toBeNull();
  });

  it('fails loudly on a stored document that no longer validates', async () => {
    const organizationId = await newOrganization();
    await handle.db.insert(schema.careersPage).values({ organizationId, draft: { version: 99 } as never, draftUpdatedAt: AT, draftUpdatedBy: 'u' });
    await expect(createDrizzleCareersPages(handle.db).find(organizationId)).rejects.toThrow();
  });
});

describe('drizzle careers media', () => {
  it('inserts, finds, lists newest first, counts and deletes, scoped by organization', async () => {
    const [mine, theirs] = [await newOrganization(), await newOrganization()];
    const repo = createDrizzleCareersMedia(handle.db);
    const older = await repo.insert(media(mine, { createdAt: new Date('2026-05-01T00:00:00Z') }));
    const newer = await repo.insert(media(mine, { kind: 'video', mime: 'video/mp4', widths: [], width: null, height: null }));
    const foreign = await repo.insert(media(theirs));
    expect(older).toMatchObject({ organizationId: mine, widths: [640, 1280], alt: { it: 'Ufficio' } });
    expect(await repo.findById(mine, foreign.id)).toBeNull();
    expect((await repo.findByIds(mine, [older.id, foreign.id])).map((row) => row.id)).toEqual([older.id]);
    expect(await repo.findByIds(mine, [])).toEqual([]);
    expect((await repo.list(mine, 10)).map((row) => row.id)).toEqual([newer.id, older.id]);
    expect(await repo.count(mine)).toBe(2);
    expect(await repo.delete(theirs, older.id)).toBe(false);
    expect(await repo.delete(mine, older.id)).toBe(true);
    expect(await repo.count(mine)).toBe(1);
    const [left] = await handle.db.select().from(schema.careersMedia).where(eq(schema.careersMedia.organizationId, theirs));
    expect(left?.id).toBe(foreign.id);
  });
});
