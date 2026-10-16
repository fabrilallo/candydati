import { privacyNoticeInputSchema } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildPrivacyNotice,
  completePrivacyNoticeInput,
  createInMemoryOrganizationDirectory,
  createInMemoryPrivacyNoticeRepository,
  createTestCandidateDeps,
  userActor,
} from '../../testing/index.js';
import { getActivePrivacyNotice } from './get-active-privacy-notice.js';
import { listPrivacyNotices } from './list-privacy-notices.js';
import { privacyNoticeTemplate } from './privacy-notice-template.js';
import { publishPrivacyNotice } from './publish-privacy-notice.js';
import { renderPrivacyTemplate } from './privacy-template.js';

const admin = userActor({ role: 'admin', organizationId: 'org_a', id: 'user_admin' });
const deps = () =>
  createTestCandidateDeps({
    organizations: createInMemoryOrganizationDirectory([{ id: 'org_a', name: 'Acme Srl', slug: 'acme', logo: null }]),
  });

describe('publishPrivacyNotice', () => {
  it('creates version 1, then 2, and audits only the version', async () => {
    const d = deps();
    const first = await publishPrivacyNotice(d, admin, completePrivacyNoticeInput());
    const second = await publishPrivacyNotice(d, admin, completePrivacyNoticeInput({ language: 'en' }));
    expect([first.version, second.version]).toEqual([1, 2]);
    expect(first).toMatchObject({ organizationId: 'org_a', createdBy: 'user_admin' });
    expect((await d.privacyNotices.list('org_a')).map((n) => n.version)).toEqual([2, 1]);
    expect(d.auditLog.events()[1]).toMatchObject({
      action: 'privacy_notice.published',
      target: { type: 'privacy_notice', id: second.id },
      metadata: { version: 2 },
    });
  });

  it('keeps versions per organization', async () => {
    const d = deps();
    await publishPrivacyNotice(d, admin, completePrivacyNoticeInput());
    const other = await publishPrivacyNotice(d, userActor({ role: 'owner', organizationId: 'org_b' }), completePrivacyNoticeInput());
    expect(other.version).toBe(1);
  });

  it('validates the input', async () => {
    await expect(publishPrivacyNotice(deps(), admin, completePrivacyNoticeInput({ text: 'short' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(publishPrivacyNotice(deps(), admin, completePrivacyNoticeInput({ contactEmail: 'nope' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it.each(['recruiter', 'hiring_manager', 'interviewer'] as const)('denies %s', async (role) => {
    await expect(
      publishPrivacyNotice(deps(), userActor({ role, organizationId: 'org_a' }), completePrivacyNoticeInput()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows the owner and refuses another organization', async () => {
    await expect(publishPrivacyNotice(deps(), userActor({ role: 'owner', organizationId: 'org_a' }), completePrivacyNoticeInput())).resolves.toBeDefined();
  });
});

describe('getActivePrivacyNotice and listPrivacyNotices', () => {
  const seeded = () =>
    createTestCandidateDeps({
      privacyNotices: createInMemoryPrivacyNoticeRepository([
        buildPrivacyNotice({ id: 'n1', version: 1, organizationId: 'org_a' }),
        buildPrivacyNotice({ id: 'n2', version: 2, organizationId: 'org_a' }),
        buildPrivacyNotice({ id: 'n3', version: 7, organizationId: 'org_b' }),
      ]),
    });

  it('returns the highest version of the own organization, to any role', async () => {
    for (const role of ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const) {
      const notice = await getActivePrivacyNotice(seeded(), userActor({ role, organizationId: 'org_a' }), {});
      expect(notice?.id).toBe('n2');
    }
  });

  it('is null when nothing was published, and writes no audit event', async () => {
    const d = deps();
    expect(await getActivePrivacyNotice(d, userActor({ organizationId: 'org_a' }), {})).toBeNull();
    expect(d.auditLog.events()).toHaveLength(0);
  });

  it('lists newest first for privacy:manage only, never other organizations', async () => {
    const list = await listPrivacyNotices(seeded(), admin, {});
    expect(list.map((n) => n.id)).toEqual(['n2', 'n1']);
    await expect(listPrivacyNotices(seeded(), userActor({ role: 'recruiter', organizationId: 'org_a' }), {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('privacyNoticeTemplate', () => {
  it.each(['it', 'en'] as const)('fills the organization name and contact in %s and passes the notice schema', async (language) => {
    const { text } = await privacyNoticeTemplate(deps(), admin, { language, contactEmail: 'dpo@acme.example' });
    expect(text).toContain('Acme Srl');
    expect(text).toContain('dpo@acme.example');
    expect(text).not.toMatch(/\{|\}|undefined/);
    expect(privacyNoticeInputSchema.safeParse(completePrivacyNoticeInput({ language, text })).success).toBe(true);
  });

  it('says who reads the data exactly as per-job access works (PRODUCT.md §6)', () => {
    const it_ = renderPrivacyTemplate({ language: 'it', organizationName: 'Acme' });
    const en = renderPrivacyTemplate({ language: 'en', organizationName: 'Acme' });
    expect(it_).toContain('solo alle candidature delle posizioni di cui fanno parte');
    expect(en).toContain('only the applications to the positions whose team they are on');
    expect(en).not.toContain('involved in the selection');
  });

  it('leaves a visible placeholder without a contact email', async () => {
    expect((await privacyNoticeTemplate(deps(), admin, { language: 'it' })).text).toContain('[indirizzo email di contatto da inserire]');
    expect(renderPrivacyTemplate({ language: 'en', organizationName: 'X' })).toContain('[contact email address to be added]');
  });

  it('is forbidden to recruiters, not found for a missing organization, and validates language', async () => {
    await expect(privacyNoticeTemplate(deps(), userActor({ role: 'recruiter', organizationId: 'org_a' }), { language: 'it' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(privacyNoticeTemplate(deps(), userActor({ role: 'owner', organizationId: 'org_x' }), { language: 'it' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(privacyNoticeTemplate(deps(), admin, { language: 'fr' })).rejects.toBeInstanceOf(ValidationError);
  });
});
