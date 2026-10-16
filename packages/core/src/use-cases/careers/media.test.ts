import { careersPageFixture } from '@candydati/domain';
import type { CareersMediaRecord } from '../../careers-ports.js';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { apiKeyActor, userActor } from '../../testing/actors.js';
import { createInMemoryFileStorage } from '../../testing/in-memory-files.js';
import { createInMemoryCareersMedia, createTestCareersDeps, fakeImageTranscoder, OTHER_ORG } from '../../testing/in-memory-careers.js';
import { revisionOf } from '../../testing/in-memory-careers.js';
import { publishCareersPage, saveCareersPageDraft } from './careers-page.js';
import { deleteCareersMedia, listCareersMedia, uploadCareersMedia } from './media.js';

const owner = userActor();
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const MP4 = Uint8Array.from([0, 0, 0, 16, ...new TextEncoder().encode('ftypisom'), 0, 0, 0, 0, 9, 9]);
const ALT = { it: 'Il team' };

describe('uploadCareersMedia', () => {
  it('re-encodes an image to WebP at each width, stores one file per width and audits the upload', async () => {
    const deps = createTestCareersDeps();
    const asset = await uploadCareersMedia(deps, owner, { bytes: JPEG, alt: ALT });
    expect(asset).toMatchObject({ kind: 'image', mime: 'image/webp', width: 2400, height: 1600, sizeBytes: 8, alt: ALT, usedInDraft: false, usedInPublished: false });
    expect(asset.variants.map((variant) => variant.width)).toEqual([640, 1280, 1920]);
    expect(asset.url).toBe(asset.variants[2]?.url);
    // The library is private: its files are read through the editor's route, never the public one.
    expect(asset.url).toMatch(/^\/api\/v1\/careers-page\/media\/[0-9a-f-]+\/files\/[0-9a-f]{16}-w1920\.webp$/);
    expect(deps.files.keys()).toHaveLength(3);
    expect(deps.files.keys().every((key) => key.startsWith(`organizations/org_test/careers-media/${asset.id}/`))).toBe(true);
    // What is stored is what the transcoder produced, never the uploaded bytes.
    expect(new TextDecoder().decode(await deps.files.get(deps.files.keys()[0]!))).toMatch(/^webp-/);
    expect(deps.auditLog.events()).toMatchObject([{ action: 'careers_media.uploaded', target: { type: 'careers_media', id: asset.id }, metadata: { kind: 'image', sizeBytes: 8 } }]);
  });

  it('stores a video as uploaded, under one content-addressed name', async () => {
    const deps = createTestCareersDeps();
    const asset = await uploadCareersMedia(deps, owner, { bytes: MP4 });
    expect(asset).toMatchObject({ kind: 'video', mime: 'video/mp4', width: null, variants: [] });
    expect(asset.url).toMatch(/\/[0-9a-f]{16}\.mp4$/);
    expect(await deps.files.get(deps.files.keys()[0]!)).toEqual(MP4);
  });

  it('refuses a file whose bytes are not an accepted image or video, whatever it claims to be', async () => {
    const deps = createTestCareersDeps();
    const fake = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    await expect(uploadCareersMedia(deps, owner, { bytes: fake, alt: ALT })).rejects.toMatchObject({ issues: [{ path: 'file', message: 'unsupported_type' }] });
    await expect(uploadCareersMedia(deps, owner, { bytes: new Uint8Array(), alt: ALT })).rejects.toMatchObject({ issues: [{ message: 'empty' }] });
    expect(deps.files.keys()).toEqual([]);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('refuses images over 8 MB and videos over 60 MB', async () => {
    const deps = createTestCareersDeps();
    const bigImage = new Uint8Array(8 * 1024 * 1024 + 1);
    bigImage.set(PNG);
    await expect(uploadCareersMedia(deps, owner, { bytes: bigImage, alt: ALT })).rejects.toMatchObject({ issues: [{ message: 'too_large' }] });
    const bigVideo = new Uint8Array(60 * 1024 * 1024 + 1);
    bigVideo.set(MP4);
    await expect(uploadCareersMedia(deps, owner, { bytes: bigVideo })).rejects.toMatchObject({ issues: [{ message: 'too_large' }] });
  });

  it('requires a description for an image', async () => {
    await expect(uploadCareersMedia(createTestCareersDeps(), owner, { bytes: JPEG })).rejects.toMatchObject({ issues: [{ message: 'alt_required' }] });
    await expect(uploadCareersMedia(createTestCareersDeps(), owner, { bytes: JPEG, alt: { en: '  ' } })).rejects.toMatchObject({ issues: [{ message: 'alt_required' }] });
  });

  it('refuses an image the transcoder cannot decode, or one with too many pixels', async () => {
    const unreadable = createTestCareersDeps({ images: fakeImageTranscoder({ reject: 'image_unreadable' }) });
    await expect(uploadCareersMedia(unreadable, owner, { bytes: JPEG, alt: ALT })).rejects.toMatchObject({ issues: [{ message: 'image_unreadable' }] });
    const bomb = createTestCareersDeps({ images: fakeImageTranscoder({ width: 20_000, height: 20_000 }) });
    await expect(uploadCareersMedia(bomb, owner, { bytes: JPEG, alt: ALT })).rejects.toMatchObject({ issues: [{ message: 'image_too_big' }] });
    const failing = createTestCareersDeps({ images: fakeImageTranscoder({ reject: 'image_too_big' }) });
    await expect(uploadCareersMedia(failing, owner, { bytes: JPEG, alt: ALT })).rejects.toMatchObject({ issues: [{ message: 'image_too_big' }] });
  });

  it('removes the stored files when the row cannot be written', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia([], { failInsert: new Error('db down') }) });
    await expect(uploadCareersMedia(deps, owner, { bytes: JPEG, alt: ALT })).rejects.toThrow('db down');
    expect(deps.files.keys()).toEqual([]);
  });

  it('refuses a new file once the library is full', async () => {
    const full = Array.from({ length: 200 }, (_, index) => ({ ...record(`m-${index}`), id: `m-${index}` }));
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(full) });
    await expect(uploadCareersMedia(deps, owner, { bytes: JPEG, alt: ALT })).rejects.toMatchObject({ issues: [{ message: 'library_full' }] });
  });

  it('is refused to a recruiter and to an API key, before anything is read or stored', async () => {
    const deps = createTestCareersDeps();
    await expect(uploadCareersMedia(deps, userActor({ role: 'recruiter' }), { bytes: JPEG, alt: ALT })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(uploadCareersMedia(deps, apiKeyActor(), { bytes: JPEG, alt: ALT })).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.files.keys()).toEqual([]);
  });
});

const record = (id: string, overrides: Partial<CareersMediaRecord> = {}): CareersMediaRecord => ({
  id,
  organizationId: 'org_test',
  kind: 'image',
  mime: 'image/webp',
  sizeBytes: 10,
  width: 1920,
  height: 1080,
  sha256: 'c'.repeat(64),
  widths: [640, 1280, 1920],
  alt: { it: 'x' },
  createdBy: 'user_test',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  ...overrides,
});

const FIXTURE_IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const library = () => FIXTURE_IDS.map((id) => record(id, id.startsWith('3') ? { kind: 'video', mime: 'video/mp4', widths: [], width: null, height: null } : {}));

describe('listCareersMedia', () => {
  it('lists the organization library only, with where each file is used', async () => {
    const extra = record('55555555-5555-4555-8555-555555555555', { createdAt: new Date('2026-05-02T00:00:00Z') });
    const foreign = record('66666666-6666-4666-8666-666666666666', { organizationId: OTHER_ORG.id });
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia([...library(), extra, foreign]) });
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: careersPageFixture() });
    const items = await listCareersMedia(deps, owner, {});
    expect(items.map((item) => item.id)).not.toContain(foreign.id);
    expect(items[0]).toMatchObject({ id: extra.id, usedInDraft: false, usedInPublished: false });
    expect(items.find((item) => item.id === FIXTURE_IDS[0])).toMatchObject({ usedInDraft: true, usedInPublished: false });
  });
});

describe('deleteCareersMedia', () => {
  const seeded = (files = createInMemoryFileStorage()) => {
    const extra = record('77777777-7777-4777-8777-777777777777');
    return { extra, deps: createTestCareersDeps({ careersMedia: createInMemoryCareersMedia([...library(), extra]), files }) };
  };

  it('deletes an unused file and its stored variants, after the commit', async () => {
    const keys = [640, 1280, 1920].map((width) => `organizations/org_test/careers-media/77777777-7777-4777-8777-777777777777/cccccccccccccccc-w${width}.webp`);
    const files = createInMemoryFileStorage(Object.fromEntries(keys.map((key) => [key, new Uint8Array([1])])));
    const { deps, extra } = seeded(files);
    await expect(deleteCareersMedia(deps, owner, { mediaId: extra.id })).resolves.toEqual({ id: extra.id });
    expect(deps.careersMedia.snapshot().map((item) => item.id)).not.toContain(extra.id);
    expect(files.keys()).toEqual([]);
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'careers_media.deleted', target: { id: extra.id } });
  });

  it('refuses to delete a file the published page uses', async () => {
    const { deps } = seeded();
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: careersPageFixture() });
    await publishCareersPage(deps, owner, { revision: await revisionOf(deps) });
    await expect(deleteCareersMedia(deps, owner, { mediaId: FIXTURE_IDS[0] })).rejects.toMatchObject({ issues: [{ path: 'mediaId', message: 'in_published_page' }] });
    expect(deps.careersMedia.snapshot()).toHaveLength(5);
  });

  it('refuses to delete a file the draft uses', async () => {
    const { deps } = seeded();
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: careersPageFixture() });
    await expect(deleteCareersMedia(deps, owner, { mediaId: FIXTURE_IDS[1] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('answers not found for a file of another organization', async () => {
    const { deps, extra } = seeded();
    await expect(deleteCareersMedia(deps, userActor({ organizationId: OTHER_ORG.id }), { mediaId: extra.id })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.careersMedia.snapshot().map((item) => item.id)).toContain(extra.id);
  });

  it('queues a retry when a stored file cannot be deleted', async () => {
    const files = { ...createInMemoryFileStorage(), delete: async () => Promise.reject(new Error('s3 down')) };
    const { deps, extra } = seeded(files as never);
    await deleteCareersMedia(deps, owner, { mediaId: extra.id });
    expect(deps.queue.jobs().map((job) => job.name)).toEqual(['files.delete', 'files.delete', 'files.delete']);
  });

  it('is refused to an interviewer', async () => {
    const { deps, extra } = seeded();
    await expect(deleteCareersMedia(deps, userActor({ role: 'interviewer' }), { mediaId: extra.id })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
