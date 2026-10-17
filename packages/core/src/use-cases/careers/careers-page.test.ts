import { careersPageDocumentSchema, careersPageFixture, defaultCareersPage } from '@candydati/domain';
import type { CareersMediaRecord } from '../../careers-ports.js';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, StaleRevisionError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { createInMemoryCareersMedia, createTestCareersDeps, OTHER_ORG } from '../../testing/in-memory-careers.js';
import { revisionOf } from '../../testing/in-memory-careers.js';
import { getCareersPageDraft, publishCareersPage, saveCareersPageDraft } from './careers-page.js';

const media = (id: string, kind: 'image' | 'video', organizationId = 'org_test'): CareersMediaRecord => ({
  id,
  organizationId,
  kind,
  mime: kind === 'image' ? 'image/webp' : 'video/mp4',
  sizeBytes: 100,
  width: kind === 'image' ? 1920 : null,
  height: kind === 'image' ? 1080 : null,
  sha256: 'b'.repeat(64),
  widths: kind === 'image' ? [640, 1280, 1920] : [],
  alt: { it: 'Foto' },
  createdBy: 'user_test',
  createdAt: new Date('2026-05-01T00:00:00Z'),
});

const FIXTURE = careersPageFixture();
const LIBRARY = [
  media('11111111-1111-4111-8111-111111111111', 'image'),
  media('22222222-2222-4222-8222-222222222222', 'image'),
  media('33333333-3333-4333-8333-333333333333', 'video'),
  media('44444444-4444-4444-8444-444444444444', 'image'),
];
const owner = userActor();
const admin = userActor({ id: 'user_admin', role: 'admin' });

describe('getCareersPageDraft', () => {
  it('gives the default page to an organization that never saved one', async () => {
    const deps = createTestCareersDeps({ defaultLocale: 'en' });
    const view = await getCareersPageDraft(deps, owner, {});
    expect(view).toMatchObject({ isDefault: true, draftUpdatedAt: null, publishedAt: null, hasUnpublishedChanges: true, organization: { slug: 'acme' } });
    expect(view.draft).toEqual(defaultCareersPage('Acme', 'en'));
  });

  it('is refused to every role but owner and admin', async () => {
    const deps = createTestCareersDeps();
    for (const role of ['recruiter', 'hiring_manager', 'interviewer'] as const) {
      await expect(getCareersPageDraft(deps, userActor({ role }), {})).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(getCareersPageDraft(deps, admin, {})).resolves.toMatchObject({ isDefault: true });
  });

  it('is refused to API keys and the agent, whatever the role behind them', async () => {
    const deps = createTestCareersDeps();
    await expect(getCareersPageDraft(deps, apiKeyActor(), {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCareersPageDraft(deps, agentActor(), {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('answers not found for an organization that does not exist', async () => {
    const deps = createTestCareersDeps();
    await expect(getCareersPageDraft(deps, userActor({ organizationId: 'org_gone' }), {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('saveCareersPageDraft', () => {
  it('saves a valid draft, audits it and leaves the published page alone', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    const view = await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: FIXTURE });
    expect(view).toMatchObject({ isDefault: false, publishedAt: null, hasUnpublishedChanges: true, draftUpdatedAt: '2026-06-01T10:00:00.000Z' });
    expect(view.draft).toEqual(careersPageDocumentSchema.parse(FIXTURE));
    expect(deps.careersPages.snapshot()[0]?.published).toBeNull();
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'careers_page.draft_saved', target: { type: 'careers_page', id: 'org_test' }, metadata: { sections: 10 } });
  });

  it('refuses an invalid document and writes nothing', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    await expect(saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: { ...FIXTURE, sections: FIXTURE.sections.filter((section) => section.type !== 'jobs') } })).rejects.toBeInstanceOf(ValidationError);
    expect(deps.careersPages.snapshot()).toEqual([]);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('refuses media that is not in the library, or of the wrong kind', async () => {
    const missing = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY.slice(1)) });
    await expect(saveCareersPageDraft(missing, owner, { revision: await revisionOf(missing), document: FIXTURE })).rejects.toMatchObject({ issues: [{ path: 'media.11111111-1111-4111-8111-111111111111', message: 'media_missing' }] });
    const swapped = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia([...LIBRARY.slice(0, 2), media('33333333-3333-4333-8333-333333333333', 'image'), LIBRARY[3]!]) });
    await expect(saveCareersPageDraft(swapped, owner, { revision: await revisionOf(swapped), document: FIXTURE })).rejects.toBeInstanceOf(ValidationError);
  });

  it('never uses the media of another organization', async () => {
    const elsewhere = LIBRARY.map((record) => ({ ...record, organizationId: OTHER_ORG.id }));
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(elsewhere) });
    await expect(saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: FIXTURE })).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps each organization to its own page', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: FIXTURE });
    const other = await getCareersPageDraft(deps, userActor({ organizationId: OTHER_ORG.id }), {});
    expect(other.isDefault).toBe(true);
    expect(other.draft.sections[0]).toMatchObject({ headline: { it: 'Posizioni aperte in Other' } });
  });

  it('is refused to a recruiter', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    await expect(saveCareersPageDraft(deps, userActor({ role: 'recruiter' }), { revision: await revisionOf(deps), document: FIXTURE })).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.careersPages.snapshot()).toEqual([]);
  });
});

describe('publishCareersPage', () => {
  it('waits for the instance email (the page leads to applications)', async () => {
    const deps = { ...createTestCareersDeps(), emailReady: () => false };
    const error = await publishCareersPage(deps, owner, { revision: await revisionOf(deps) }).catch((e: unknown) => e);
    expect((error as ValidationError).issues).toEqual([{ path: 'email', message: 'email_not_configured' }]);
    expect(deps.careersPages.snapshot()).toEqual([]);
  });

  it('publishes the saved draft and audits it', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: FIXTURE });
    const view = await publishCareersPage(deps, admin, { revision: await revisionOf(deps) });
    expect(view).toMatchObject({ publishedAt: '2026-06-01T10:00:00.000Z', hasUnpublishedChanges: false });
    expect(deps.careersPages.snapshot()[0]?.published).toEqual(careersPageDocumentSchema.parse(FIXTURE));
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'careers_page.published', actor: { id: 'user_admin' } });
  });

  it('publishes the default page when nothing was saved', async () => {
    const deps = createTestCareersDeps();
    const view = await publishCareersPage(deps, owner, { revision: await revisionOf(deps) });
    expect(view.isDefault).toBe(false);
    expect(deps.careersPages.snapshot()[0]?.published).toEqual(defaultCareersPage('Acme', 'it'));
  });

  it('reports unpublished changes after the next save', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    await publishCareersPage(deps, owner, { revision: await revisionOf(deps) });
    const view = await saveCareersPageDraft(deps, owner, { revision: await revisionOf(deps), document: FIXTURE });
    expect(view.hasUnpublishedChanges).toBe(true);
    expect(view.publishedAt).not.toBeNull();
  });

  it('is refused to a hiring manager', async () => {
    await expect(publishCareersPage(createTestCareersDeps(), userActor({ role: 'hiring_manager' }), { revision: 0 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('optimistic concurrency', () => {
  it('counts revisions from 0 and refuses a save over a revision the editor never saw', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    expect((await getCareersPageDraft(deps, owner, {})).revision).toBe(0);
    const first = await saveCareersPageDraft(deps, owner, { revision: 0, document: FIXTURE });
    expect(first.revision).toBe(1);
    // A second person still holds revision 0: their save is refused, the first one stays.
    const error = await saveCareersPageDraft(deps, admin, { revision: 0, document: defaultCareersPage('Acme') }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StaleRevisionError);
    expect((error as StaleRevisionError).code).toBe('stale_revision');
    expect(deps.careersPages.snapshot()[0]?.draft).toEqual(careersPageDocumentSchema.parse(FIXTURE));
    expect(deps.auditLog.events().filter((event) => event.action === 'careers_page.draft_saved')).toHaveLength(1);
    await expect(saveCareersPageDraft(deps, admin, { revision: 1, document: defaultCareersPage('Acme') })).resolves.toMatchObject({ revision: 2 });
  });

  it('refuses to publish a draft the editor has not seen, and bumps the revision when it publishes', async () => {
    const deps = createTestCareersDeps({ careersMedia: createInMemoryCareersMedia(LIBRARY) });
    await saveCareersPageDraft(deps, owner, { revision: 0, document: FIXTURE });
    await expect(publishCareersPage(deps, admin, { revision: 0 })).rejects.toBeInstanceOf(StaleRevisionError);
    expect(deps.careersPages.snapshot()[0]?.published).toBeNull();
    await expect(publishCareersPage(deps, admin, { revision: 1 })).resolves.toMatchObject({ revision: 2, hasUnpublishedChanges: false });
  });

  it('refuses a stale publication of a page never saved once someone saved it', async () => {
    const deps = createTestCareersDeps();
    await publishCareersPage(deps, owner, { revision: 0 });
    await expect(publishCareersPage(deps, admin, { revision: 0 })).rejects.toBeInstanceOf(StaleRevisionError);
  });
});
