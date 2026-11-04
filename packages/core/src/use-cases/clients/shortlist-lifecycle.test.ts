import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../errors.js';
import { userActor } from '../../testing/actors.js';
import { buildApplication, buildCandidate } from '../../testing/candidate-fixtures.js';
import { ORG_A } from '../../testing/candidate-seed.js';
import { seedClientWorld, type TestClientDeps } from '../../testing/client-deps.js';
import { decideApplications } from '../candidates/decide-applications.js';
import { closeJob } from '../jobs/close-job.js';
import { archiveClient, updateClient } from './clients.js';
import { setJobClient } from './job-client.js';
import { answerShortlistCandidate, getClientShortlist } from './shortlist-public.js';
import { scanShortlistReminders } from './shortlist-reminders.js';
import { sendShortlist } from './shortlists.js';

const DAY = 86_400_000;
const recruiter = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
const INPUT = { jobId: 'job_1', contactId: 'contact_1', candidates: [{ applicationId: 'app_1' }, { applicationId: 'app_2' }] };

async function sentWorld(): Promise<{ deps: TestClientDeps; token: string; at: (days: number) => Date }> {
  const deps = await seedClientWorld({
    candidates: [buildCandidate({ organizationId: ORG_A }), buildCandidate({ id: 'cand_2', organizationId: ORG_A, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' })],
    applications: [buildApplication({ organizationId: ORG_A }), buildApplication({ id: 'app_2', candidateId: 'cand_2', organizationId: ORG_A })],
  });
  await setJobClient(deps, recruiter, { jobId: 'job_1', clientId: 'client_1' });
  await sendShortlist(deps, recruiter, INPUT);
  const token = /\/shortlist\/([a-z0-9]+)/.exec(deps.sender.sent().at(-1)?.text ?? '')?.[1] ?? '';
  const created = deps.clientStore.get().shortlists[0]?.createdAt ?? new Date();
  return { deps, token, at: (days) => new Date(created.getTime() + days * DAY) };
}

const revoked = (deps: TestClientDeps) => deps.clientStore.get().shortlists[0]?.revokedAt ?? null;
const revocations = (deps: TestClientDeps) => deps.auditLog.events().filter((e) => e.action === 'shortlist.revoked').map((e) => e.metadata);

describe('a shortlist does not outlive its context', () => {
  it('is revoked instead of reminded when the client was archived', async () => {
    const { deps, token, at } = await sentWorld();
    await archiveClient(deps, recruiter, { clientId: 'client_1', archived: true });
    const mails = deps.sender.sent().length;
    expect(await scanShortlistReminders(deps, { now: at(3) })).toEqual({ reminded: 0, failed: 0 });
    expect(deps.sender.sent()).toHaveLength(mails);
    expect(revoked(deps)).not.toBeNull();
    expect(revocations(deps)).toEqual([{ reason: 'client_archived' }]);
    await expect(getClientShortlist(deps, { token })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is revoked when the contact it went to was removed from the client', async () => {
    const { deps, at } = await sentWorld();
    await updateClient(deps, recruiter, { clientId: 'client_1', name: 'Acme Test Client', contacts: [{ name: 'Someone Else', email: 'else@client.example' }] });
    await scanShortlistReminders(deps, { now: at(3) });
    expect(revocations(deps)).toEqual([{ reason: 'contact_removed' }]);
  });

  it('is revoked when its job is closed, at once and by the scan', async () => {
    const { deps, at } = await sentWorld();
    await decideApplications(deps, recruiter, { applicationIds: ['app_1', 'app_2'], outcome: 'not_selected' });
    await closeJob(deps, recruiter, { jobId: 'job_1' });
    expect(revoked(deps)).not.toBeNull();
    expect(revocations(deps)).toEqual([{ reason: 'job_closed' }]);
    expect(await scanShortlistReminders(deps, { now: at(3) })).toEqual({ reminded: 0, failed: 0 });
  });

  it('hides a candidate whose application was decided, and refuses an answer about them', async () => {
    const { deps, token } = await sentWorld();
    const [ada] = (await getClientShortlist(deps, { token })).candidates;
    await decideApplications(deps, recruiter, { applicationIds: ['app_1'], outcome: 'withdrawn' });
    expect((await getClientShortlist(deps, { token })).candidates.map((c) => c.firstName)).toEqual(['Grace']);
    await expect(answerShortlistCandidate(deps, { token, itemId: ada?.itemId, answer: 'meet', reason: 'Strong profile' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
