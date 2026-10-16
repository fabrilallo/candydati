import { careersPageDocumentSchema, careersPageFixture, defaultCareersPage } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import type { CareersMediaRecord } from '../../careers-ports.js';
import { ORG_A, ORG_B, seedPrivacyData, userActor } from '../../testing/index.js';
import { buildOrganizationExport, requestOrganizationExport } from './organization-export.js';

const admin = userActor({ id: 'user_a', role: 'admin', organizationId: ORG_A });
const media = (organizationId: string, id: string): CareersMediaRecord => ({
  id,
  organizationId,
  kind: 'image',
  mime: 'image/webp',
  sizeBytes: 3,
  width: 1280,
  height: 720,
  sha256: 'f'.repeat(64),
  widths: [640, 1280],
  alt: { it: 'Ufficio' },
  createdBy: 'user_a',
  createdAt: new Date('2026-05-01T00:00:00Z'),
});

describe('organization export: careers page', () => {
  it('contains the draft, the published page, the media list and every stored media file of the organization only', async () => {
    const deps = await seedPrivacyData();
    const page = careersPageDocumentSchema.parse(careersPageFixture());
    await deps.careersPages.saveDraft(ORG_A, page, deps.now(), 'user_a', 0);
    await deps.careersPages.publish(ORG_A, defaultCareersPage('A'), deps.now(), 'user_a', 1);
    await deps.careersPages.saveDraft(ORG_A, page, deps.now(), 'user_a', 2);
    const mine = await deps.careersMedia.insert(media(ORG_A, 'm-a'));
    await deps.careersMedia.insert(media(ORG_B, 'm-b'));
    for (const width of [640, 1280]) await deps.files.put(`organizations/${ORG_A}/careers-media/m-a/ffffffffffffffff-w${width}.webp`, new Uint8Array([width % 7]), 'image/webp');

    const created = await requestOrganizationExport(deps, admin, {});
    await buildOrganizationExport(deps, { organizationId: ORG_A, exportId: created.id });
    const entries = deps.zip.writers()[0]!.entries();
    const read = (path: string) => JSON.parse(new TextDecoder().decode(entries.find((entry) => entry.path === path)!.bytes)) as Record<string, unknown>;
    expect(read('careers/page.json')).toMatchObject({ revision: 3, draft: { theme: { accent: '#0b6e4f' } }, published: { sections: [{ type: 'hero' }, { type: 'jobs' }] } });
    expect(read('careers/media.json')).toMatchObject({ media: [{ id: mine.id, kind: 'image', files: ['careers/media/m-a/ffffffffffffffff-w640.webp', 'careers/media/m-a/ffffffffffffffff-w1280.webp'] }] });
    const paths = entries.map((entry) => entry.path);
    expect(paths).toEqual(expect.arrayContaining(['careers/media/m-a/ffffffffffffffff-w640.webp', 'careers/media/m-a/ffffffffffffffff-w1280.webp']));
    expect(paths.some((path) => path.includes('m-b'))).toBe(false);
  });

  it('writes an empty careers entry for an organization that never saved a page', async () => {
    const deps = await seedPrivacyData();
    const created = await requestOrganizationExport(deps, admin, {});
    await buildOrganizationExport(deps, { organizationId: ORG_A, exportId: created.id });
    const entry = deps.zip.writers()[0]!.entries().find((item) => item.path === 'careers/page.json')!;
    expect(JSON.parse(new TextDecoder().decode(entry.bytes))).toEqual({ draft: null, published: null, revision: 0, draftUpdatedAt: null, publishedAt: null });
  });
});
