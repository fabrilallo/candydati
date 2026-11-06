import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../errors.js';
import { apiKeyActor, buildCandidate, buildJob, seedSourcingWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { addSourcedContacts, deleteSourcedContact, listSourcedContacts, markSourcedContacted, sourcedNoticeText } from './contacts.js';
import { getSourcingSetting, setSourcingSetting } from './setting.js';
import { eraseExpiredSourcedContacts } from './expiry.js';
import { objectToSourcing, viewSourcingNotice } from './public-notice.js';
import { sendSourcingNotice } from './send-notice.js';

const rita = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const hugo = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });
const maja = { firstName: 'Maja', lastName: 'Lind', headline: 'Backend engineer', location: 'Stockholm', source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/maja-lind/', evidence: [{ criterion: 'Go', text: '4 years of Go', where: 'experience' }] } as const;
const world = (extra: Parameters<typeof seedSourcingWorld>[0] = {}) => seedSourcingWorld({ jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published' })], ...extra });
const secretOf = (url: string): string => url.split('/').pop() ?? '';

describe('adding sourced contacts', () => {
  it('adds a found person as a contact of the job, expiring in 30 days, and gives the notice link once', async () => {
    const deps = world();
    const [result] = await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [maja] });
    expect(result).toMatchObject({ outcome: 'added', profileUrl: maja.profileUrl, candidateId: null });
    expect(result?.noticeUrl).toMatch(/^https?:\/\/.+\/sourcing\/notice\/.{16,}$/);
    const [stored] = deps.contacts.snapshot();
    expect(stored).toMatchObject({ jobId: 'job_1', profileKey: 'linkedin.com/in/maja-lind', status: 'found', createdBy: 'recruiter_1' });
    expect(stored!.expiresAt.getTime() - stored!.createdAt.getTime()).toBe(30 * 86_400_000);
    expect(stored?.noticeTokenHash).not.toContain(secretOf(result?.noticeUrl ?? ''));
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'sourced_contact.added', target: { type: 'job', id: 'job_1' }, metadata: { added: 1, skipped: 0 } });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('Lind');
  });

  it('skips who is already a contact, already a candidate (by email or LinkedIn link) or objected, and twice in one call', async () => {
    const deps = world({ candidates: [buildCandidate({ id: 'cand_9', organizationId: ORG_A, email: 'ada@example.com', linkedinUrl: 'https://it.linkedin.com/in/ada' })] });
    await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [maja] });
    const results = await addSourcedContacts(deps, rita, {
      jobId: 'job_1',
      contacts: [
        maja,
        { ...maja, firstName: 'Ada', profileUrl: 'https://www.linkedin.com/in/ada' },
        { ...maja, firstName: 'Bo', profileUrl: 'https://github.com/bo', source: 'github', email: 'ADA@example.com' },
        { ...maja, firstName: 'Cy', profileUrl: 'https://github.com/cy', source: 'github' },
        { ...maja, firstName: 'Cy', profileUrl: 'https://github.com/CY/', source: 'github' },
      ],
    });
    expect(results.map((r) => [r.outcome, r.candidateId])).toEqual([
      ['already_contact', null],
      ['already_candidate', 'cand_9'],
      ['already_candidate', 'cand_9'],
      ['added', null],
      ['already_contact', null],
    ]);
  });

  it('leaves the notice to the first message by default, even with a known email', async () => {
    const deps = world();
    await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ ...maja, email: 'maja@example.com' }] });
    expect(deps.queue.jobs().filter((job) => job.name === 'sourcing.notice')).toEqual([]);
  });

  it('when the organization chose it, emails the art. 14 notice at once to a known address and marks the contact notified', async () => {
    const deps = world({ noticeByEmail: true });
    const [added] = await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ ...maja, email: 'maja@example.com' }] });
    expect(deps.queue.jobs()).toContainEqual({ name: 'sourcing.notice', payload: { organizationId: ORG_A, contactId: added?.contactId } });
    expect(await sendSourcingNotice(deps, { organizationId: ORG_A, contactId: added?.contactId ?? '' })).toEqual({ sent: true });
    expect(await sendSourcingNotice(deps, { organizationId: ORG_A, contactId: added?.contactId ?? '' })).toEqual({ sent: false });
    expect(deps.sender.sent()).toHaveLength(1);
    const [mail] = deps.sender.sent();
    expect(mail).toMatchObject({ to: 'maja@example.com' });
    expect(mail?.text).toContain('art. 14');
    expect(deps.contacts.snapshot()[0]).toMatchObject({ status: 'notified' });
    expect(deps.contacts.snapshot()[0]?.noticeSentAt).not.toBeNull();
  });

  it('is refused without sourcing:manage and on a job of another organization', async () => {
    await expect(addSourcedContacts(world(), hugo, { jobId: 'job_1', contacts: [maja] })).rejects.toBeInstanceOf(ForbiddenError);
    const outsider = userActor({ id: 'x', role: 'owner', organizationId: ORG_B });
    await expect(addSourcedContacts(world(), outsider, { jobId: 'job_1', contacts: [maja] })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('working with contacts', () => {
  it('lists the contacts of a job, gives a fresh notice text for a first message and marks a contact as contacted', async () => {
    const deps = world();
    const [added] = await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [maja] });
    const [listed] = await listSourcedContacts(deps, rita, { jobId: 'job_1' });
    expect(listed).toMatchObject({ firstName: 'Maja', evidence: maja.evidence });
    const notice = await sourcedNoticeText(deps, rita, { contactId: listed!.id });
    expect(notice.text).toContain(notice.url);
    expect(notice.url).not.toBe(added?.noticeUrl);
    await expect(viewSourcingNotice(deps, { token: secretOf(added?.noticeUrl ?? '') })).rejects.toBeInstanceOf(NotFoundError);
    await markSourcedContacted(deps, rita, { contactId: listed!.id });
    expect(deps.contacts.snapshot()[0]).toMatchObject({ status: 'contacted' });
  });

  it('deletes a contact, and with doNotContact also remembers the objection', async () => {
    const deps = world();
    await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [maja] });
    await deleteSourcedContact(deps, rita, { contactId: deps.contacts.snapshot()[0]!.id, doNotContact: true });
    expect(deps.contacts.snapshot()).toEqual([]);
    const [again] = await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [maja] });
    expect(again?.outcome).toBe('objected');
  });
});

describe('the public notice page', () => {
  it('shows the person what is kept about them, and erasing removes the contact and blocks a new one', async () => {
    const deps = world();
    const [added] = await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ ...maja, email: 'maja@example.com' }] });
    const token = secretOf(added?.noticeUrl ?? '');
    const page = await viewSourcingNotice(deps, { token });
    expect(page).toMatchObject({ firstName: 'Maja', lastName: 'Lind', source: 'linkedin', jobTitle: expect.any(String), organizationName: expect.any(String), evidence: maja.evidence });
    await objectToSourcing(deps, { token });
    expect(deps.contacts.snapshot()).toEqual([]);
    expect(deps.objections.snapshot()).toHaveLength(2);
    await expect(viewSourcingNotice(deps, { token })).rejects.toBeInstanceOf(NotFoundError);
    const [again] = await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ ...maja, profileUrl: 'https://github.com/maja', source: 'github', email: 'maja@example.com' }] });
    expect(again?.outcome).toBe('objected');
    expect(deps.auditLog.events().map((e) => e.action)).toContain('sourced_contact.objected');
  });
});

describe('expiry', () => {
  it('erases every contact past 30 days, across organizations', async () => {
    const deps = world();
    await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [maja] });
    const later = new Date(deps.now().getTime() + 31 * 86_400_000);
    expect(await eraseExpiredSourcedContacts(deps, { now: later })).toEqual({ erased: 1 });
    expect(deps.contacts.snapshot()).toEqual([]);
  });
});

describe('the sourcing setting', () => {
  it('is off by default; owners and admins turn the notice email on, audited, and never a key', async () => {
    const deps = world();
    const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
    expect(await getSourcingSetting(deps, rita, {})).toEqual({ noticeByEmail: false });
    await expect(setSourcingSetting(deps, rita, { noticeByEmail: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await setSourcingSetting(deps, owner, { noticeByEmail: true })).toEqual({ noticeByEmail: true });
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'organization.sourcing_setting_updated', metadata: { noticeByEmail: true } });
    await expect(setSourcingSetting(deps, apiKeyActor({ organizationId: ORG_A, role: 'owner' }), { noticeByEmail: false })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
