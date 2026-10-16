import { and, eq, schema } from '@candydati/db';
import { careersPageFixture, type CareersMediaAssetDto, type CareersPageEditorDto, type PublicCareersPageDto } from '@candydati/domain';
import { sharp } from '@candydati/providers/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, type World } from './testing/candidate-world.js';
import type { TestUser } from './testing/client.js';
import { multipartBody, type FieldPart, type FilePart } from './testing/multipart.js';
import { createTestApp, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const MARKER = 'secret-marker-123';
const MP4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, ...Array(1000).fill(7)]);

const jpegWithExif = (width = 1400, height = 700): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .withExif({ IFD0: { Copyright: MARKER, ImageDescription: 'GPS 45.4642 N 9.19 E' } })
    .jpeg()
    .toBuffer();

interface Upload {
  readonly bytes: Uint8Array;
  readonly fileName?: string;
  readonly contentType?: string;
  readonly alt?: Record<string, string>;
  readonly extra?: readonly (FieldPart | FilePart)[];
}

const upload = (user: TestUser, file: Upload) => {
  const fields: FieldPart[] = Object.entries(file.alt ?? {}).map(([lang, value]) => ({ name: `alt.${lang}`, value }));
  const { payload, headers } = multipartBody([
    ...fields,
    { name: 'file', filename: file.fileName ?? 'photo.jpg', bytes: file.bytes, contentType: file.contentType ?? 'image/jpeg' },
    ...(file.extra ?? []),
  ]);
  return t.app.inject({ method: 'POST', url: '/api/v1/careers-page/media', headers: { origin: WEB_ORIGIN, cookie: user.cookieHeader(), ...headers }, payload });
};

const uploaded = async (user: TestUser, file: Upload): Promise<CareersMediaAssetDto> => {
  const response = await upload(user, file);
  expect(response.statusCode, response.body).toBe(201);
  return (response.json() as { data: CareersMediaAssetDto }).data;
};

const privateGet = (user: TestUser, url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url, headers: { cookie: user.cookieHeader(), ...headers } });
const editorOf = async (user: TestUser): Promise<CareersPageEditorDto> => (await user.get<CareersPageEditorDto>('/api/v1/careers-page')).body.data!;
/** Saves over the revision the editor holds now (no conflict). */
const saveDraft = async (user: TestUser, document: unknown) =>
  user.put<CareersPageEditorDto>('/api/v1/careers-page/draft', { revision: (await editorOf(user)).revision, document });
const publish = async (user: TestUser) => user.post<CareersPageEditorDto>('/api/v1/careers-page/publish', { revision: (await editorOf(user)).revision });

const pageUsing = (imageId: string) => {
  const fixture = careersPageFixture();
  return {
    version: 1,
    defaultLocale: 'it',
    theme: fixture.theme,
    sections: [
      { id: 'ufficio', type: 'image_text', imageId, alt: { it: 'Il team' }, imageSide: 'right', title: { it: "L'ufficio" }, body: { it: 'Luce e piante.' } },
      { id: 'jobs', type: 'jobs', title: { it: 'Posizioni aperte' }, intro: {} },
    ],
  };
};

const publicPage = (slug: string) => t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${slug}/careers-page` });
const publicMedia = async (slug: string, id: string) => ((await publicPage(slug)).json() as { data: PublicCareersPageDto }).data.media[id];
const mediaGet = (url: string, headers: Record<string, string> = {}) => t.app.inject({ method: 'GET', url, headers });
const auditActions = async (w: World): Promise<string[]> => {
  const org = (await t.handle.db.select().from(schema.organization).where(eq(schema.organization.slug, w.slug)))[0]!;
  const rows = await t.handle.db.select().from(schema.auditLog).where(and(eq(schema.auditLog.organizationId, org.id)));
  return rows.map((row) => row.action);
};

describe('careers page: draft and publish', () => {
  it('shows the default page, then the published one, and audits both steps', async () => {
    const w = await createWorld(t);
    const initial = (await w.owner.get<CareersPageEditorDto>('/api/v1/careers-page')).body.data!;
    expect(initial.isDefault).toBe(true);

    const asset = await uploaded(w.owner, { bytes: await jpegWithExif(), alt: { it: 'Il team' } });
    const saved = await saveDraft(w.owner, pageUsing(asset.id));
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ isDefault: false, hasUnpublishedChanges: true, publishedAt: null, revision: 1 });

    // The draft is private until it is published: visitors still get the default page.
    const before = (await publicPage(w.slug)).json() as { data: PublicCareersPageDto };
    expect(before.data.page.sections.map((s) => s.type)).not.toContain('image_text');

    // Draft media is not public: only the editor's route serves it.
    const draftFile = asset.variants[0]!.url;
    expect(draftFile).toMatch(/^\/api\/v1\/careers-page\/media\//);
    const publicDraftFile = `/api/v1/public/organizations/${w.slug}/careers-media/${asset.id}/${draftFile.split('/').at(-1)}`;
    expect((await mediaGet(publicDraftFile)).statusCode).toBe(404);

    const published = await publish(w.owner);
    expect(published.status).toBe(200);
    expect(published.body.data).toMatchObject({ hasUnpublishedChanges: false, revision: 2 });
    expect((await mediaGet(publicDraftFile)).statusCode).toBe(200);
    const response = await publicPage(w.slug);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('s-maxage');
    const page = (response.json() as { data: PublicCareersPageDto }).data;
    expect(page.page.sections.map((s) => s.type)).toEqual(['image_text', 'jobs']);
    expect(page.media[asset.id]).toMatchObject({ kind: 'image', mime: 'image/webp' });
    expect(await auditActions(w)).toEqual(expect.arrayContaining(['careers_page.draft_saved', 'careers_page.published', 'careers_media.uploaded']));
  });

  it('refuses a save or a publication over a revision someone else replaced (409 stale_revision)', async () => {
    const w = await createWorld(t);
    const admin = await w.member('admin');
    const asset = await uploaded(w.owner, { bytes: await jpegWithExif(200, 100), alt: { it: 'x' } });
    const held = (await editorOf(admin)).revision;
    expect((await saveDraft(w.owner, pageUsing(asset.id))).status).toBe(200);
    const stale = await admin.put('/api/v1/careers-page/draft', { revision: held, document: pageUsing(asset.id) });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'stale_revision' });
    const stalePublish = await admin.post('/api/v1/careers-page/publish', { revision: held });
    expect(stalePublish.status).toBe(409);
    expect((await editorOf(w.owner)).publishedAt).toBeNull();
  });

  it('refuses an invalid document with 422 and does not cache errors', async () => {
    const w = await createWorld(t);
    const bad = await w.owner.put('/api/v1/careers-page/draft', { version: 1, sections: [] });
    expect(bad.status).toBe(422);
    const missing = await publicPage('no-such-organization');
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBeUndefined();
  });
});

describe('careers page: access', () => {
  it('refuses every management route to a recruiter (403), before reading an upload', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    const asset = await uploaded(w.owner, { bytes: await jpegWithExif(200, 100), alt: { it: 'x' } });
    const calls = [
      recruiter.get('/api/v1/careers-page'),
      recruiter.put('/api/v1/careers-page/draft', pageUsing(asset.id)),
      recruiter.post('/api/v1/careers-page/publish'),
      recruiter.get('/api/v1/careers-page/media'),
      recruiter.delete(`/api/v1/careers-page/media/${asset.id}`),
    ];
    for (const reply of await Promise.all(calls)) expect(reply.status).toBe(403);
    expect((await privateGet(recruiter, asset.url)).statusCode).toBe(403);
    expect((await upload(recruiter, { bytes: await jpegWithExif(200, 100), alt: { it: 'x' } })).statusCode).toBe(403);
  });

  it('lets an admin manage the page', async () => {
    const w = await createWorld(t);
    const admin = await w.member('admin');
    expect((await admin.get('/api/v1/careers-page')).status).toBe(200);
  });

  it('refuses an API key even with every scope it may hold (403), and the signed-out (401)', async () => {
    const w = await createWorld(t);
    const key = await createKey(w.owner, ['job:read', 'candidate:read']);
    const headers = { authorization: `Bearer ${key.secret}` };
    for (const [method, url] of [['GET', '/api/v1/careers-page'], ['POST', '/api/v1/careers-page/publish'], ['GET', '/api/v1/careers-page/media']] as const) {
      expect((await t.app.inject({ method, url, headers })).statusCode, `${method} ${url}`).toBe(403);
    }
    const { payload, headers: form } = multipartBody([{ name: 'file', filename: 'a.jpg', bytes: new Uint8Array([1]) }]);
    expect((await t.app.inject({ method: 'POST', url: '/api/v1/careers-page/media', headers: { ...headers, ...form }, payload })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/careers-page' })).statusCode).toBe(401);
  });

  it('isolates organizations', async () => {
    const a = await createWorld(t, 'Alpha');
    const b = await createWorld(t, 'Beta');
    const asset = await uploaded(a.owner, { bytes: await jpegWithExif(300, 200), alt: { it: 'x' } });
    expect((await b.owner.get<CareersMediaAssetDto[]>('/api/v1/careers-page/media')).body.data).toEqual([]);
    expect((await b.owner.delete(`/api/v1/careers-page/media/${asset.id}`)).status).toBe(404);
    // The library route: the owner of A reads it, a member of another organization does not, nobody signed out does.
    expect((await privateGet(a.owner, asset.url)).statusCode).toBe(200);
    expect((await privateGet(b.owner, asset.url)).statusCode).toBe(404);
    expect((await mediaGet(asset.url)).statusCode).toBe(401);
    // A's published file is not reachable through B's slug.
    await saveDraft(a.owner, pageUsing(asset.id));
    await publish(a.owner);
    const published = (await publicMedia(a.slug, asset.id))!.url;
    expect((await mediaGet(published)).statusCode).toBe(200);
    const crossed = published.replace(`/organizations/${a.slug}/`, `/organizations/${b.slug}/`);
    expect(crossed).not.toBe(published);
    expect((await mediaGet(crossed)).statusCode).toBe(404);
    const draftB = (await b.owner.get<CareersPageEditorDto>('/api/v1/careers-page')).body.data!;
    expect(draftB.isDefault).toBe(true);
    // B cannot reference A's media in its page either.
    expect((await saveDraft(b.owner, pageUsing(asset.id))).status).toBe(422);
  });
});

describe('careers media: upload', () => {
  it('refuses content that is not an accepted image or video, whatever the name and declared type', async () => {
    const w = await createWorld(t);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const bytes of [svg, new TextEncoder().encode('<html><body>x</body></html>')]) {
      const response = await upload(w.owner, { bytes, fileName: 'photo.jpg', contentType: 'image/jpeg', alt: { it: 'x' } });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ success: false, error: { issues: [{ path: 'file', message: 'unsupported_type' }] } });
    }
  });

  it('refuses an image without a description, an empty file and unknown parts', async () => {
    const w = await createWorld(t);
    const jpeg = await jpegWithExif(100, 100);
    const noAlt = await upload(w.owner, { bytes: jpeg });
    expect(noAlt.statusCode).toBe(422);
    expect(noAlt.json()).toMatchObject({ error: { issues: [{ path: 'file', message: 'alt_required' }] } });
    expect(((await upload(w.owner, { bytes: new Uint8Array(0), alt: { it: 'x' } })).json() as { error: { issues: { message: string }[] } }).error.issues[0]!.message).toBe('empty');
    const extra = await upload(w.owner, { bytes: jpeg, alt: { it: 'x' }, extra: [{ name: 'other', value: 'y' }] });
    expect(extra.statusCode).toBe(422);
  });

  it('re-encodes an image as WebP without metadata; private to the editor, immutable once published', async () => {
    const w = await createWorld(t);
    const source = await jpegWithExif();
    expect(source.includes(MARKER)).toBe(true);
    const asset = await uploaded(w.owner, { bytes: source, alt: { it: 'Il team' } });
    expect(asset).toMatchObject({ kind: 'image', mime: 'image/webp', width: 1400, height: 700 });
    // Never wider than the original: the last variant is the original width.
    expect(asset.variants.map((v) => v.width)).toEqual([640, 1280, 1400]);
    for (const variant of asset.variants) {
      const response = await privateGet(w.owner, variant.url);
      expect(response.statusCode).toBe(200);
      expect(response.headers).toMatchObject({
        'content-type': 'image/webp',
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cross-origin-resource-policy': 'same-site',
      });
      expect(Number(response.headers['content-length'])).toBe(response.rawPayload.byteLength);
      const meta = await sharp(response.rawPayload).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(response.rawPayload.includes(MARKER)).toBe(false);
    }
    await saveDraft(w.owner, pageUsing(asset.id));
    await publish(w.owner);
    const published = await mediaGet((await publicMedia(w.slug, asset.id))!.url);
    expect(published.statusCode).toBe(200);
    expect(published.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(published.rawPayload.includes(MARKER)).toBe(false);
  });

  it('answers HEAD without a body and refuses a file name the asset does not have', async () => {
    const w = await createWorld(t);
    const asset = await uploaded(w.owner, { bytes: await jpegWithExif(300, 200), alt: { it: 'x' } });
    const head = await t.app.inject({ method: 'HEAD', url: asset.url, headers: { cookie: w.owner.cookieHeader() } });
    expect(head.statusCode).toBe(200);
    expect(head.rawPayload.byteLength).toBe(0);
    expect(head.headers['content-type']).toBe('image/webp');
    const wrong = await privateGet(w.owner, asset.url.replace(/[^/]+$/, (name) => `${name[0] === 'a' ? 'b' : 'a'}${name.slice(1)}`));
    expect(wrong.statusCode).toBe(404);
    // Errors are never cacheable (the api's no-store default on non-public routes).
    expect(wrong.headers['cache-control']).toBe('private, no-store');
    expect((await privateGet(w.owner, asset.url.replace(/[^/]+$/, 'x.html'))).statusCode).toBe(422);
  });

  it('refuses an upload larger than the limit with 422 too_large, never a 5xx', async () => {
    const w = await createWorld(t);
    const huge = new Uint8Array(60 * 1024 * 1024 + 2);
    huge.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const response = await upload(w.owner, { bytes: huge, fileName: 'big.mp4', contentType: 'video/mp4' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { issues: [{ path: 'file', message: 'too_large' }] } });
    const tooBigImage = await upload(w.owner, { bytes: Buffer.concat([await jpegWithExif(10, 10), Buffer.alloc(9 * 1024 * 1024)]), alt: { it: 'x' } });
    expect(tooBigImage.statusCode).toBe(422);
    expect(tooBigImage.json()).toMatchObject({ error: { issues: [{ message: 'too_large' }] } });
  });
});

describe('careers media: delete and video ranges', () => {
  it('refuses to delete media in use, then deletes unused media and 404s its URL', async () => {
    const w = await createWorld(t);
    const used = await uploaded(w.owner, { bytes: await jpegWithExif(300, 200), alt: { it: 'x' } });
    const spare = await uploaded(w.owner, { bytes: await jpegWithExif(300, 200), alt: { it: 'y' } });
    await saveDraft(w.owner, pageUsing(used.id));
    const inDraft = await w.owner.delete(`/api/v1/careers-page/media/${used.id}`);
    expect(inDraft.status).toBe(422);
    expect(inDraft.body.error).toMatchObject({ code: 'validation_failed' });
    await publish(w.owner);
    const inPublished = await w.owner.delete<unknown>(`/api/v1/careers-page/media/${used.id}`);
    expect(inPublished.status).toBe(422);
    expect(JSON.stringify(inPublished.body)).toContain('in_published_page');

    const list = (await w.owner.get<CareersMediaAssetDto[]>('/api/v1/careers-page/media')).body.data!;
    expect(list.find((a) => a.id === used.id)).toMatchObject({ usedInDraft: true, usedInPublished: true });
    expect(list.find((a) => a.id === spare.id)).toMatchObject({ usedInDraft: false, usedInPublished: false });

    const removed = await w.owner.delete<{ id: string }>(`/api/v1/careers-page/media/${spare.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ id: spare.id });
    expect((await privateGet(w.owner, spare.url)).statusCode).toBe(404);
    expect(await auditActions(w)).toContain('careers_media.deleted');
  });

  it('serves a video with ranges: 200 whole, 206 partial, 416 past the end', async () => {
    const w = await createWorld(t);
    const video = await uploaded(w.owner, { bytes: MP4, fileName: 'clip.mp4', contentType: 'video/mp4' });
    expect(video).toMatchObject({ kind: 'video', mime: 'video/mp4' });
    const whole = await privateGet(w.owner, video.url);
    expect(whole.statusCode).toBe(200);
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.rawPayload.byteLength).toBe(MP4.byteLength);

    const part = await privateGet(w.owner, video.url, { range: 'bytes=10-19' });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 10-19/${MP4.byteLength}`);
    expect(part.headers['content-length']).toBe('10');
    expect([...part.rawPayload]).toEqual([...MP4.subarray(10, 20)]);
    expect(part.headers['cache-control']).toBe('private, max-age=300');

    const open = await privateGet(w.owner, video.url, { range: 'bytes=1000-' });
    expect(open.statusCode).toBe(206);
    expect(open.headers['content-range']).toBe(`bytes 1000-${MP4.byteLength - 1}/${MP4.byteLength}`);
    const clamped = await privateGet(w.owner, video.url, { range: `bytes=0-${MP4.byteLength * 10}` });
    expect(clamped.headers['content-range']).toBe(`bytes 0-${MP4.byteLength - 1}/${MP4.byteLength}`);

    const past = await privateGet(w.owner, video.url, { range: `bytes=${MP4.byteLength}-` });
    expect(past.statusCode).toBe(416);
    expect(past.headers['content-range']).toBe(`bytes */${MP4.byteLength}`);
    expect(past.headers['cache-control']).toBe('private, no-store');
    expect(past.json()).toMatchObject({ success: false });

    const suffix = await privateGet(w.owner, video.url, { range: 'bytes=-5' });
    expect(suffix.statusCode).toBe(200);
    expect(suffix.rawPayload.byteLength).toBe(MP4.byteLength);
  });
});
