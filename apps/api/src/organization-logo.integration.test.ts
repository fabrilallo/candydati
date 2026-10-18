import { and, eq, schema } from '@candydati/db';
import type { CareersMediaAssetDto, OrganizationLogoDto, PublicCareersPageDto } from '@candydati/domain';
import { sharp } from '@candydati/providers/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, type World } from './testing/candidate-world.js';
import type { TestUser } from './testing/client.js';
import { multipartBody } from './testing/multipart.js';
import { createTestApp, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const LOGO_PATH = '/api/v1/organization/logo';

const uploadLogo = async (user: TestUser): Promise<CareersMediaAssetDto> => {
  const bytes = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const { payload, headers } = multipartBody([
    { name: 'alt.it', value: 'Logo' },
    { name: 'file', filename: 'logo.png', bytes, contentType: 'image/png' },
  ]);
  const response = await t.app.inject({ method: 'POST', url: '/api/v1/careers-page/media', headers: { origin: WEB_ORIGIN, cookie: user.cookieHeader(), ...headers }, payload });
  expect(response.statusCode, response.body).toBe(201);
  return (response.json() as { data: CareersMediaAssetDto }).data;
};

const publicOrganizationLogo = async (slug: string): Promise<string | null> =>
  ((await t.app.inject({ method: 'GET', url: `/api/v1/public/organizations/${slug}/careers-page` })).json() as { data: PublicCareersPageDto }).data.organization.logo;

const logoEvents = async (w: World): Promise<number> => {
  const [org] = await t.handle.db.select().from(schema.organization).where(eq(schema.organization.slug, w.slug));
  const rows = await t.handle.db.select().from(schema.auditLog).where(and(eq(schema.auditLog.organizationId, org!.id), eq(schema.auditLog.action, 'organization.logo_changed')));
  return rows.length;
};

describe('organization logo', () => {
  it('makes an uploaded image the logo of the careers page, served publicly and cached, then an address, then nothing', async () => {
    const w = await createWorld(t);
    const asset = await uploadLogo(w.owner);

    const set = await w.owner.put<OrganizationLogoDto>(LOGO_PATH, { source: { kind: 'media', mediaId: asset.id } });
    expect(set.status).toBe(200);
    const url = set.body.data!.url!;
    expect(url).toMatch(new RegExp(`^/api/v1/public/organizations/${w.slug}/careers-media/${asset.id}/[0-9a-f]{16}-w300\\.webp$`));
    expect(await publicOrganizationLogo(w.slug)).toBe(url);
    const file = await t.app.inject({ method: 'GET', url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['cache-control']).toContain('public');

    // Any member reads it (the app shows it); the library image cannot be deleted while it is the logo.
    const recruiter = await w.member('recruiter');
    expect((await recruiter.get<OrganizationLogoDto>(LOGO_PATH)).body.data).toEqual({ source: { kind: 'media', mediaId: asset.id }, url });
    const refused = await w.owner.delete(`/api/v1/careers-page/media/${asset.id}`);
    expect(refused.status).toBe(422);
    expect(refused.body.error?.issues).toEqual([{ path: 'mediaId', message: 'in_logo' }]);

    await w.owner.put(LOGO_PATH, { source: { kind: 'url', url: 'https://cdn.example/logo.png' } });
    expect(await publicOrganizationLogo(w.slug)).toBe('https://cdn.example/logo.png');
    expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(404);

    await w.owner.put(LOGO_PATH, { source: null });
    expect(await publicOrganizationLogo(w.slug)).toBeNull();
    expect(await logoEvents(w)).toBe(3);
  });

  it('is changed by owners and admins only, and only to an https address', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.put(LOGO_PATH, { source: null })).status).toBe(403);
    expect((await w.owner.put(LOGO_PATH, { source: { kind: 'url', url: 'javascript:alert(1)' } })).status).toBe(422);
    expect(await logoEvents(w)).toBe(0);
  });
});
