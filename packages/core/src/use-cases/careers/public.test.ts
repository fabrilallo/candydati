import { careersPageDocumentSchema, careersPageFixture } from '@candydati/domain';
import type { CareersMediaRecord } from '../../careers-ports.js';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../errors.js';
import { apiKeyActor, userActor } from '../../testing/actors.js';
import { createInMemoryFileStorage } from '../../testing/in-memory-files.js';
import { createInMemoryCareersMedia, createTestCareersDeps, OTHER_ORG } from '../../testing/in-memory-careers.js';
import { revisionOf } from '../../testing/in-memory-careers.js';
import { publishCareersPage, saveCareersPageDraft } from './careers-page.js';
import { getCareersMediaFile } from './media.js';
import { getPublicCareersMedia, getPublicCareersPage, isRangeNotSatisfiable, unsatisfiedRangeSize } from './public.js';

const owner = userActor();
const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const record = (id: string, overrides: Partial<CareersMediaRecord> = {}): CareersMediaRecord => ({
  id,
  organizationId: 'org_test',
  kind: 'image',
  mime: 'image/webp',
  sizeBytes: 10,
  width: 1920,
  height: 1080,
  sha256: 'd'.repeat(64),
  widths: [640, 1280, 1920],
  alt: {},
  createdBy: 'user_test',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  ...overrides,
});
const VIDEO = record(IDS[2]!, { kind: 'video', mime: 'video/mp4', widths: [], width: null, height: null, sizeBytes: 10 });
const library = () => [record(IDS[0]!), record(IDS[1]!), VIDEO, record(IDS[3]!)];

describe('getPublicCareersPage', () => {
  it('serves the default page while nothing is published, even with a saved draft', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(library()) });
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: careersPageFixture() });
    const page = await getPublicCareersPage(deps, { organizationSlug: 'acme' });
    expect(page).toMatchObject({ organization: { name: 'Acme', slug: 'acme' }, publishedAt: null, media: {} });
    expect(page.page.sections.map((section) => section.type)).toEqual(['hero', 'jobs']);
  });

  it('serves the published page with its visible sections and the media they use', async () => {
    const fixture = careersPageFixture();
    const hidden = { ...fixture, sections: fixture.sections.map((section) => (section.id === 'persone' ? { ...section, visible: false } : section)) };
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(library()) });
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: hidden });
    await publishCareersPage(deps, owner, { revision: await revisionOf(deps) });
    const page = await getPublicCareersPage(deps, { organizationSlug: 'acme' });
    expect(page.page.sections.map((section) => section.id)).not.toContain('persone');
    expect(Object.keys(page.media).toSorted()).toEqual(IDS.toSorted());
    expect(page.media[IDS[0]!]?.variants).toHaveLength(3);
    expect(page.media[IDS[2]!]).toMatchObject({ kind: 'video', url: `/api/v1/public/organizations/acme/careers-media/${IDS[2]}/dddddddddddddddd.mp4` });
    expect(page.publishedAt).toBe('2026-06-01T10:00:00.000Z');
  });

  it('does not show draft changes made after publishing', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(library()) });
    await publishCareersPage(deps, owner, { revision: await revisionOf(deps) });
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: careersPageFixture() });
    const page = await getPublicCareersPage(deps, { organizationSlug: 'acme' });
    expect(page.page).toEqual(careersPageDocumentSchema.parse({ ...page.page }));
    expect(page.page.sections).toHaveLength(2);
  });

  it('answers not found for an unknown organization', async () => {
    await expect(getPublicCareersPage(createTestCareersDeps(), { organizationSlug: 'nobody' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getPublicCareersMedia', () => {
  const key = (name: string, id = IDS[0]!) => `organizations/org_test/careers-media/${id}/${name}`;
  const stored = () =>
    createInMemoryFileStorage({
      [key('dddddddddddddddd-w640.webp')]: new Uint8Array([1, 2, 3]),
      [key('dddddddddddddddd.mp4', IDS[2])]: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    });
  /** The library with the fixture page saved, and published unless `publish` is false. */
  const seeded = async (publish = true) => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(library()), files: stored() });
    await saveCareersPageDraft(deps, owner, { revision: 0, document: careersPageFixture() });
    if (publish) await publishCareersPage(deps, owner, { revision: 1 });
    return deps;
  };
  const read = async (stream: AsyncIterable<Uint8Array>): Promise<number[]> => {
    const out: number[] = [];
    for await (const chunk of stream) out.push(...chunk);
    return out;
  };

  it('streams a stored variant with its type', async () => {
    const file = await getPublicCareersMedia(await seeded(), { organizationSlug: 'acme', mediaId: IDS[0], fileName: 'dddddddddddddddd-w640.webp' });
    expect(file).toMatchObject({ mime: 'image/webp', sizeBytes: 3, range: null });
    expect(await read(file.body.stream)).toEqual([1, 2, 3]);
  });

  it('cuts a byte range out of a video', async () => {
    const file = await getPublicCareersMedia(await seeded(), { organizationSlug: 'acme', mediaId: IDS[2], fileName: 'dddddddddddddddd.mp4', range: { start: 2, end: null } });
    expect(file).toMatchObject({ mime: 'video/mp4', sizeBytes: 10, range: { start: 2, end: 9 } });
    expect(await read(file.body.stream)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    const capped = await getPublicCareersMedia(await seeded(), { organizationSlug: 'acme', mediaId: IDS[2], fileName: 'dddddddddddddddd.mp4', range: { start: 0, end: 99 } });
    expect(capped.range).toEqual({ start: 0, end: 9 });
    const refused = await getPublicCareersMedia(await seeded(), { organizationSlug: 'acme', mediaId: IDS[2], fileName: 'dddddddddddddddd.mp4', range: { start: 50, end: null } }).catch((error: unknown) => error);
    expect(isRangeNotSatisfiable(refused)).toBe(true);
    expect(unsatisfiedRangeSize(refused)).toBe(10);
    expect(unsatisfiedRangeSize(new Error('x'))).toBeNull();
  });

  it('serves nothing of a page that is only a draft', async () => {
    const deps = await seeded(false);
    await expect(getPublicCareersMedia(deps, { organizationSlug: 'acme', mediaId: IDS[0], fileName: 'dddddddddddddddd-w640.webp' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('serves nothing that only a hidden section or the library holds', async () => {
    const fixture = careersPageFixture();
    const hidden = { ...fixture, sections: fixture.sections.map((section) => (section.id === 'ufficio' || section.id === 'galleria' ? { ...section, visible: false } : section)) };
    const extra = record('55555555-5555-4555-8555-555555555555');
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia([...library(), extra]), files: stored() });
    await saveCareersPageDraft(deps, owner, { revision: 0, document: hidden });
    await publishCareersPage(deps, owner, { revision: 1 });
    await expect(getPublicCareersMedia(deps, { organizationSlug: 'acme', mediaId: IDS[0], fileName: 'dddddddddddddddd-w640.webp' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPublicCareersMedia(deps, { organizationSlug: 'acme', mediaId: extra.id, fileName: 'dddddddddddddddd-w640.webp' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses names the asset does not have, other organizations and path tricks', async () => {
    const deps = await seeded();
    await expect(getPublicCareersMedia(deps, { organizationSlug: 'acme', mediaId: IDS[0], fileName: 'dddddddddddddddd-w800.webp' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPublicCareersMedia(deps, { organizationSlug: OTHER_ORG.slug, mediaId: IDS[0], fileName: 'dddddddddddddddd-w640.webp' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPublicCareersMedia(deps, { organizationSlug: 'acme', mediaId: IDS[0], fileName: '../../applications/x/cv' })).rejects.toThrow();
    await expect(getPublicCareersMedia(deps, { organizationSlug: 'acme', mediaId: 'missing', fileName: 'dddddddddddddddd-w640.webp' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPublicCareersMedia(deps, { organizationSlug: 'nobody', mediaId: IDS[0], fileName: 'dddddddddddddddd-w640.webp' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getCareersMediaFile', () => {
  const files = () => createInMemoryFileStorage({ [`organizations/org_test/careers-media/${IDS[0]}/dddddddddddddddd-w640.webp`]: new Uint8Array([7]) });

  it('gives the editor any file of its library, published or not', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(library()), files: files() });
    await expect(getCareersMediaFile(deps, owner, { mediaId: IDS[0], fileName: 'dddddddddddddddd-w640.webp' })).resolves.toMatchObject({ mime: 'image/webp', range: null });
  });

  it('refuses people without the permission and answers not found to another organization', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(library()), files: files() });
    const input = { mediaId: IDS[0], fileName: 'dddddddddddddddd-w640.webp' };
    await expect(getCareersMediaFile(deps, userActor({ role: 'recruiter' }), input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareersMediaFile(deps, apiKeyActor(), input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareersMediaFile(deps, userActor({ organizationId: OTHER_ORG.id }), input)).rejects.toBeInstanceOf(NotFoundError);
  });
});
