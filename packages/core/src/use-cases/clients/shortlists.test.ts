import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, userActor } from '../../testing/actors.js';
import { buildApplication, buildCandidate, buildNote } from '../../testing/candidate-fixtures.js';
import { ORG_A, ORG_B } from '../../testing/candidate-seed.js';
import { buildClient, seedClientWorld, type TestClientDeps } from '../../testing/client-deps.js';
import { getApplicationTimeline } from '../candidates/application-timeline.js';
import { eraseApplication } from '../privacy/erase-candidate.js';
import { exportCandidate } from '../privacy/export-candidate.js';
import { setJobClient } from './job-client.js';
import { answerShortlistCandidate, getClientShortlist, openShortlistCv } from './shortlist-public.js';
import { scanShortlistReminders, shortlistReminderIsDue } from './shortlist-reminders.js';
import { listJobShortlists, revokeShortlist, sendShortlist } from './shortlists.js';

const recruiter = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
const manager = userActor({ organizationId: ORG_A, id: 'hm_1', role: 'hiring_manager' });

const NOTES = [
  buildNote({ id: 'note_shared', organizationId: ORG_A, applicationId: 'app_1', body: 'Clear communicator, led a migration.' }),
  buildNote({ id: 'note_private', organizationId: ORG_A, applicationId: 'app_1', body: 'Salary expectations are high.' }),
  buildNote({ id: 'note_other', organizationId: ORG_A, candidateId: 'cand_2', applicationId: 'app_2', body: 'Other person.' }),
];

async function shortlistWorld(display: 'named' | 'confidential' = 'named'): Promise<TestClientDeps> {
  const deps = await seedClientWorld({
    candidates: [buildCandidate({ organizationId: ORG_A }), buildCandidate({ id: 'cand_2', organizationId: ORG_A, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' })],
    applications: [
      buildApplication({ organizationId: ORG_A }),
      buildApplication({ id: 'app_2', candidateId: 'cand_2', organizationId: ORG_A, cv: null }),
      buildApplication({ id: 'app_done', candidateId: 'cand_2', organizationId: ORG_A, outcome: 'not_selected' }),
    ],
    notes: NOTES,
  });
  await setJobClient(deps, recruiter, { jobId: 'job_1', clientId: 'client_1', display });
  return deps;
}

const INPUT = {
  jobId: 'job_1',
  contactId: 'contact_1',
  message: 'Two strong profiles for you.',
  candidates: [{ applicationId: 'app_1', shareCv: true, noteIds: ['note_shared'] }, { applicationId: 'app_2' }],
};

const secretOf = (deps: TestClientDeps): string => {
  const mail = deps.sender.sent().filter((m) => m.to === 'carla@client.example').at(-1);
  const match = mail?.text.match(/\/shortlist\/([a-z0-9]+)/);
  if (!match?.[1]) throw new Error('no shortlist link sent');
  return match[1];
};

describe('sendShortlist', () => {
  it('stores only the hash, emails the contact a personal link, tells each candidate and audits ids only', async () => {
    const deps = await shortlistWorld();
    const view = await sendShortlist(deps, recruiter, INPUT);
    expect(view).toMatchObject({ jobId: 'job_1', clientName: 'Acme Test Client', recipientName: 'Carla Contact', status: 'open', remindersSent: 0 });
    expect(view.items.map((i) => [i.candidateName, i.shareCv, i.sharedNoteCount, i.candidateNotified])).toEqual([
      ['Ada Lovelace', true, 1, true],
      ['Grace Hopper', false, 0, true],
    ]);
    const secret = secretOf(deps);
    const stored = deps.clientStore.get().shortlists[0];
    expect(stored?.tokenHash).toBe(deps.hash(secret));
    expect(JSON.stringify(deps.clientStore.get())).not.toContain(secret);
    expect(JSON.stringify(view)).not.toContain(secret);
    const mail = deps.sender.sent().find((m) => m.to === 'carla@client.example');
    expect(mail?.text).not.toContain('Lovelace');
    const notices = await deps.messages.listByApplication(ORG_A, 'app_1');
    expect(notices.at(-1)).toMatchObject({ direction: 'outbound', status: 'queued', sentBy: 'recruiter_1' });
    expect(notices.at(-1)?.bodyText).toContain('Acme Test Client');
    expect(notices.at(-1)?.bodyText).toContain('il curriculum');
    const event = deps.auditLog.events().find((e) => e.action === 'shortlist.sent');
    expect(event).toMatchObject({ target: { type: 'client_shortlist', id: view.id }, metadata: { jobId: 'job_1', clientId: 'client_1', candidates: 2, notified: 2 } });
    expect(JSON.stringify(event)).not.toMatch(/carla|ada@/);
  });

  it('tells the candidate of a confidential client that it is a client of the agency, never its name', async () => {
    const deps = await shortlistWorld('confidential');
    await sendShortlist(deps, recruiter, INPUT);
    const body = (await deps.messages.listByApplication(ORG_A, 'app_2')).at(-1)?.bodyText ?? '';
    expect(body).not.toContain('Acme Test Client');
    expect(body).toContain("un'azienda cliente di Acme");
  });

  it('refuses candidates who are not open applicants of the job, notes of someone else, and unknown contacts', async () => {
    const deps = await shortlistWorld();
    const attempt = (patch: object) => sendShortlist(deps, recruiter, { ...INPUT, ...patch });
    await expect(attempt({ candidates: [{ applicationId: 'app_done' }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ candidates: [{ applicationId: 'nope' }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ candidates: [{ applicationId: 'app_1', noteIds: ['note_other'] }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt({ contactId: 'nobody' })).rejects.toBeInstanceOf(ValidationError);
    expect(deps.clientStore.get().shortlists).toEqual([]);
    expect(deps.sender.sent()).toEqual([]);
  });

  it('needs a job with a client, an open job and the agency setting', async () => {
    const noClient = await seedClientWorld();
    await expect(sendShortlist(noClient, recruiter, INPUT)).rejects.toBeInstanceOf(ConflictError);
    const off = await shortlistWorld();
    await off.organizationSettings.setAgency(ORG_A, { recruitsForClients: false, agencyAuthorization: null }, new Date());
    await expect(sendShortlist(off, recruiter, INPUT)).rejects.toBeInstanceOf(ConflictError);
    const archived = await seedClientWorld({ clients: [buildClient({ archivedAt: new Date() })] });
    await archived.jobClients.set({ organizationId: ORG_A, jobId: 'job_1', clientId: 'client_1', display: 'named', updatedBy: 'u', updatedAt: new Date() });
    await expect(sendShortlist(archived, recruiter, INPUT)).rejects.toBeInstanceOf(ConflictError);
  });

  it('is a person: never an API key or the assistant, never a hiring manager, never another organization', async () => {
    const deps = await shortlistWorld();
    await expect(sendShortlist(deps, apiKeyActor({ organizationId: ORG_A, role: 'owner' }), INPUT)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendShortlist(deps, agentActor({ organizationId: ORG_A, role: 'owner' }), INPUT)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendShortlist(deps, manager, INPUT)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendShortlist(deps, userActor({ organizationId: ORG_B, role: 'owner' }), INPUT)).rejects.toBeInstanceOf(ConflictError);
    await deps.organizationSettings.setAgency(ORG_B, { recruitsForClients: true, agencyAuthorization: null }, new Date());
    await expect(sendShortlist(deps, userActor({ organizationId: ORG_B, role: 'owner' }), INPUT)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listJobShortlists and revokeShortlist', () => {
  it('lists the shortlists of a job with the answers, and a revoked link stops working', async () => {
    const deps = await shortlistWorld();
    const sent = await sendShortlist(deps, recruiter, INPUT);
    const [listed] = await listJobShortlists(deps, userActor({ organizationId: ORG_A, role: 'admin' }), { jobId: 'job_1' });
    await expect(listJobShortlists(deps, manager, { jobId: 'job_1' })).rejects.toBeInstanceOf(NotFoundError);
    expect(listed?.id).toBe(sent.id);
    const secret = secretOf(deps);
    await expect(revokeShortlist(deps, manager, { shortlistId: sent.id })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await revokeShortlist(deps, recruiter, { shortlistId: sent.id })).status).toBe('revoked');
    await expect(revokeShortlist(deps, recruiter, { shortlistId: sent.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(getClientShortlist(deps, { token: secret })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.auditLog.events().at(-1)?.action).toBe('shortlist.revoked');
  });
});

describe('the client page', () => {
  it('shows only what the recruiter chose: names, the shared notes and whether a CV is there, nothing else', async () => {
    const deps = await shortlistWorld();
    await sendShortlist(deps, recruiter, INPUT);
    const view = await getClientShortlist(deps, { token: secretOf(deps) });
    expect(view).toMatchObject({ agencyName: 'Acme', clientName: 'Acme Test Client', recipientName: 'Carla Contact', message: 'Two strong profiles for you.', language: 'it' });
    expect(view.candidates.map((c) => [c.firstName, c.hasCv, c.notes.map((n) => n.body)])).toEqual([
      ['Ada', true, ['Clear communicator, led a migration.']],
      ['Grace', false, []],
    ]);
    const text = JSON.stringify(view);
    for (const leak of ['ada@example.com', 'Salary expectations', 'app_1', 'cand_1', 'job_1', 'client_1', 'recruiter_1']) expect(text).not.toContain(leak);
    await getClientShortlist(deps, { token: secretOf(deps) });
    expect(deps.auditLog.events().filter((e) => e.action === 'shortlist.opened')).toHaveLength(1);
  });

  it('records one answer per candidate with its reason, on the audit log, without moving the application', async () => {
    const deps = await shortlistWorld();
    await sendShortlist(deps, recruiter, INPUT);
    const token = secretOf(deps);
    const [first] = (await getClientShortlist(deps, { token })).candidates;
    const answered = await answerShortlistCandidate(deps, { token, itemId: first?.itemId, answer: 'meet', reason: 'Great background' });
    expect(answered).toMatchObject({ answer: 'meet', answerReason: 'Great background' });
    await expect(answerShortlistCandidate(deps, { token, itemId: first?.itemId, answer: 'not_for_us', reason: 'Changed mind' })).rejects.toBeInstanceOf(ConflictError);
    await expect(answerShortlistCandidate(deps, { token, itemId: first?.itemId, answer: 'meet', reason: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(answerShortlistCandidate(deps, { token, itemId: 'other', answer: 'meet', reason: 'Great background' })).rejects.toBeInstanceOf(NotFoundError);
    expect((await deps.applications.findById(ORG_A, 'app_1'))?.stageId).toBe('received');
    const timeline = await getApplicationTimeline(deps, recruiter, { applicationId: 'app_1' });
    expect(timeline.items.filter((i) => i.kind === 'shortlist_shared' || i.kind === 'client_answered')).toMatchObject([
      { kind: 'shortlist_shared', clientName: 'Acme Test Client' },
      { kind: 'client_answered', clientName: 'Acme Test Client', answer: 'meet', reason: 'Great background', actor: { type: 'external', name: 'Carla Contact' } },
    ]);
    expect(deps.auditLog.events().find((e) => e.action === 'shortlist.answered')).toMatchObject({ actor: { type: 'system', id: 'shortlist_page' }, metadata: { applicationId: 'app_1', answer: 'meet' } });
  });

  it('opens the CV only when it was shared, and refuses unknown or expired links alike', async () => {
    const deps = await shortlistWorld();
    await sendShortlist(deps, recruiter, INPUT);
    const token = secretOf(deps);
    const [ada, grace] = (await getClientShortlist(deps, { token })).candidates;
    await deps.files.put('organizations/org_test/applications/app_1/cv', new Uint8Array([37, 80, 68, 70]), 'application/pdf');
    expect((await openShortlistCv(deps, { token, itemId: ada?.itemId })).mediaType).toBe('application/pdf');
    await expect(openShortlistCv(deps, { token, itemId: grace?.itemId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getClientShortlist(deps, { token: 'x'.repeat(26) })).rejects.toBeInstanceOf(NotFoundError);
    const expired = { ...deps, now: () => new Date(Date.now() + 30 * 86_400_000) };
    await expect(getClientShortlist(expired, { token })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('scanShortlistReminders', () => {
  const DAY = 86_400_000;

  it('reminds after 3 and 7 days with a new link, while a candidate is unanswered, and the old link stops working', async () => {
    const deps = await shortlistWorld();
    await sendShortlist(deps, recruiter, INPUT);
    const first = secretOf(deps);
    const created = deps.clientStore.get().shortlists[0]?.createdAt ?? new Date();
    const at = (days: number) => new Date(created.getTime() + days * DAY);
    expect(await scanShortlistReminders(deps, { now: at(1) })).toEqual({ reminded: 0, failed: 0 });
    expect(await scanShortlistReminders(deps, { now: at(3) })).toEqual({ reminded: 1, failed: 0 });
    const second = secretOf(deps);
    expect(second).not.toBe(first);
    expect(deps.sender.sent().at(-1)?.subject).toMatch(/^Promemoria/);
    const late = { ...deps, now: () => at(3) };
    await expect(getClientShortlist(late, { token: first })).rejects.toBeInstanceOf(NotFoundError);
    expect(await scanShortlistReminders(deps, { now: at(3.5) })).toEqual({ reminded: 0, failed: 0 });
    expect(await scanShortlistReminders(deps, { now: at(7) })).toEqual({ reminded: 1, failed: 0 });
    expect(await scanShortlistReminders(deps, { now: at(10) })).toEqual({ reminded: 0, failed: 0 });
    expect(deps.auditLog.events().filter((e) => e.action === 'shortlist.reminded')).toHaveLength(2);
  });

  it('never reminds once every candidate is answered, revoked or expired', () => {
    const base = { createdAt: new Date(0), expiresAt: new Date(20 * DAY), revokedAt: null, remindersSent: 0, lastReminderAt: null } as never;
    const now = new Date(4 * DAY);
    expect(shortlistReminderIsDue(base, [{ answer: null }], now)).toBe(true);
    expect(shortlistReminderIsDue(base, [{ answer: 'meet' }], now)).toBe(false);
    expect(shortlistReminderIsDue({ ...(base as object), revokedAt: now } as never, [{ answer: null }], now)).toBe(false);
    expect(shortlistReminderIsDue(base, [{ answer: null }], new Date(21 * DAY))).toBe(false);
  });

  it('puts the old link back when the email cannot be sent', async () => {
    const deps = await shortlistWorld();
    await sendShortlist(deps, recruiter, INPUT);
    const first = secretOf(deps);
    const created = deps.clientStore.get().shortlists[0]?.createdAt ?? new Date();
    const failing = { ...deps, sender: { send: async () => Promise.reject(new Error('smtp down')) } };
    expect(await scanShortlistReminders(failing, { now: new Date(created.getTime() + 3 * DAY) })).toEqual({ reminded: 0, failed: 1 });
    expect(deps.clientStore.get().shortlists[0]?.tokenHash).toBe(deps.hash(first));
  });
});

describe('export and erasure', () => {
  it('tells the candidate in their export which client saw their data, even a confidential one, and never the link', async () => {
    const deps = await shortlistWorld('confidential');
    await sendShortlist(deps, recruiter, INPUT);
    const { json } = await exportCandidate(deps, userActor({ organizationId: ORG_A, role: 'owner' }), { candidateId: 'cand_1' });
    expect(json.applications[0]?.sharedWithClients).toMatchObject([{ clientName: 'Acme Test Client', sharedCv: true, sharedNotes: 1, answer: null }]);
    expect(JSON.stringify(json)).not.toMatch(/tokenHash|carla@/);
  });

  it('takes the candidate out of every shortlist; the shortlist stays for the others', async () => {
    const deps = await shortlistWorld();
    await sendShortlist(deps, recruiter, INPUT);
    await eraseApplication(deps, userActor({ organizationId: ORG_A, role: 'owner' }), { applicationId: 'app_1', confirmName: 'Ada Lovelace' });
    expect(deps.clientStore.get().items.map((i) => i.applicationId)).toEqual(['app_2']);
    const view = await getClientShortlist(deps, { token: secretOf(deps) });
    expect(view.candidates.map((c) => c.firstName)).toEqual(['Grace']);
  });
});
