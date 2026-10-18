import { careersMediaKey } from '@candydati/domain';
import type { CareersMediaRecord } from '../../careers-ports.js';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { userActor } from '../../testing/actors.js';
import { createInMemoryCareersMedia, createTestCareersDeps } from '../../testing/in-memory-careers.js';
import { getOrganizationLogo, setOrganizationLogo } from './logo.js';
import { deleteCareersMedia } from './media.js';
import { getPublicCareersMedia } from './public.js';

const owner = userActor();
const recruiter = userActor({ role: 'recruiter' });
const IMAGE_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const record = (id: string, overrides: Partial<CareersMediaRecord> = {}): CareersMediaRecord => ({
  id,
  organizationId: 'org_test',
  kind: 'image',
  mime: 'image/webp',
  sizeBytes: 10,
  width: 800,
  height: 400,
  sha256: 'c'.repeat(64),
  widths: [640, 800],
  alt: {},
  createdBy: 'user_test',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  ...overrides,
});
const library = () => createInMemoryCareersMedia([record(IMAGE_ID), record(VIDEO_ID, { kind: 'video', mime: 'video/mp4', widths: [], width: null, height: null })]);
const LOGO_PATH = `/api/v1/public/organizations/acme/careers-media/${IMAGE_ID}/${'c'.repeat(16)}-w640.webp`;

describe('setOrganizationLogo', () => {
  it('makes a library image the logo, served at its smallest width from the public route, and audits the change', async () => {
    const deps = createTestCareersDeps({ careersMedia: library() });
    const logo = await setOrganizationLogo(deps, owner, { source: { kind: 'media', mediaId: IMAGE_ID } });
    expect(logo).toEqual({ source: { kind: 'media', mediaId: IMAGE_ID }, url: LOGO_PATH });
    expect(await getOrganizationLogo(deps, recruiter, {})).toEqual(logo);
    expect(deps.auditLog.events()).toMatchObject([{ action: 'organization.logo_changed', target: { type: 'organization', id: 'org_test' }, metadata: { source: 'media' } }]);
  });

  it('takes an https address, or nothing', async () => {
    const deps = createTestCareersDeps();
    expect(await setOrganizationLogo(deps, owner, { source: { kind: 'url', url: 'https://cdn.example/l.png' } })).toEqual({ source: { kind: 'url', url: 'https://cdn.example/l.png' }, url: 'https://cdn.example/l.png' });
    expect(await setOrganizationLogo(deps, owner, { source: null })).toEqual({ source: null, url: null });
    expect(deps.auditLog.events().map((event) => event.metadata)).toEqual([{ source: 'url' }, { source: 'none' }]);
  });

  it('refuses a video, an image of another organization and an address that is not https', async () => {
    const deps = createTestCareersDeps({ careersMedia: library() });
    await expect(setOrganizationLogo(deps, owner, { source: { kind: 'media', mediaId: VIDEO_ID } })).rejects.toMatchObject({ issues: [{ path: 'source.mediaId', message: 'logo_not_image' }] });
    const other = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia([record(IMAGE_ID, { organizationId: 'org_other' })]) });
    await expect(setOrganizationLogo(other, owner, { source: { kind: 'media', mediaId: IMAGE_ID } })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setOrganizationLogo(deps, owner, { source: { kind: 'url', url: 'http://cdn.example/l.png' } })).rejects.toBeInstanceOf(ValidationError);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('is for owners and admins only', async () => {
    const deps = createTestCareersDeps();
    await expect(setOrganizationLogo(deps, recruiter, { source: null })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('the library image used as logo', () => {
  it('is served to visitors though no published section uses it, and stops being when it is no longer the logo', async () => {
    const deps = createTestCareersDeps({ careersMedia: library() });
    const input = { organizationSlug: 'acme', mediaId: IMAGE_ID, fileName: `${'c'.repeat(16)}-w640.webp` };
    await deps.files.put(careersMediaKey('org_test', IMAGE_ID, input.fileName), new TextEncoder().encode('webp-640'), 'image/webp');
    await expect(getPublicCareersMedia(deps, input)).rejects.toBeInstanceOf(NotFoundError);
    await setOrganizationLogo(deps, owner, { source: { kind: 'media', mediaId: IMAGE_ID } });
    await expect(getPublicCareersMedia(deps, input)).resolves.toMatchObject({ mime: 'image/webp' });
    await setOrganizationLogo(deps, owner, { source: null });
    await expect(getPublicCareersMedia(deps, input)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cannot be deleted from the library while it is the logo', async () => {
    const deps = createTestCareersDeps({ careersMedia: library() });
    await setOrganizationLogo(deps, owner, { source: { kind: 'media', mediaId: IMAGE_ID } });
    await expect(deleteCareersMedia(deps, owner, { mediaId: IMAGE_ID })).rejects.toMatchObject({ issues: [{ path: 'mediaId', message: 'in_logo' }] });
    await setOrganizationLogo(deps, owner, { source: null });
    await expect(deleteCareersMedia(deps, owner, { mediaId: IMAGE_ID })).resolves.toEqual({ id: IMAGE_ID });
  });
});
