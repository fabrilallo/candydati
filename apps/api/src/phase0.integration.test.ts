import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Dto {
  action: string;
  organizationId: string;
  actor: { type: string; id: string | null; onBehalfOfUserId: string | null; name: string | null };
  target: { type: string; id: string };
  metadata: Record<string, unknown>;
  occurredAt: string;
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const newUser = (label: string) => new TestUser(t.app, uniqueEmail(label), `User ${label}`);
const auditLog = (who: TestUser, query = '') => who.get<Dto[]>(`/api/v1/audit-log${query}`);
const actions = (events: Dto[]) => events.map((e) => e.action);

async function invite(inviter: TestUser, invitee: TestUser, role: string) {
  const reply = await inviter.post('/api/auth/organization/invite-member', { email: invitee.email, role });
  return { reply, id: (reply.body as unknown as { id?: string }).id ?? '' };
}

/** Owner A with an organization, plus B (recruiter) and C (admin) who joined through invitations. */
async function organizationWithTeam() {
  const owner = await newUser('owner').signUp();
  const organizationId = await owner.createOrganization('Acme');
  const recruiter = await newUser('recruiter').signUp();
  const admin = await newUser('admin').signUp();
  for (const [person, role] of [[recruiter, 'recruiter'], [admin, 'admin']] as const) {
    const { id } = await invite(owner, person, role);
    expect((await person.post('/api/auth/organization/accept-invitation', { invitationId: id })).status).toBe(200);
  }
  return { owner, recruiter, admin, organizationId };
}

describe('Phase 0: create organization, invite a colleague, everything is audited', () => {
  it('records the whole story with correct actors, newest first', async () => {
    const a = await newUser('a').signUp();
    const organizationId = await a.createOrganization('Acme');
    const b = await newUser('b').signUp();

    const { reply, id: invitationId } = await invite(a, b, 'recruiter');
    expect(reply.status).toBe(200);
    const invitationMail = t.mailbox.sent.at(-1)!;
    expect(invitationMail).toMatchObject({ to: b.email, email: { kind: 'invitation', organizationName: 'Acme', roleLabel: 'recruiter' } });
    expect(invitationMail.email.link).toBe(`http://localhost:3000/accept-invitation/${invitationId}`);

    const accepted = await b.post('/api/auth/organization/accept-invitation', { invitationId });
    expect(accepted.status).toBe(200);

    const log = await auditLog(a);
    expect(log.status).toBe(200);
    expect(log.body).toMatchObject({ success: true, error: null, meta: { total: 5, page: 1, limit: 20 } });
    const events = log.body.data as Dto[];
    expect(actions(events)).toEqual([
      'member.added',
      'invitation.accepted',
      'invitation.created',
      'organization.created',
      'member.added',
    ]);
    const [memberAdded, accepted_, created, orgCreated, founder] = events as [Dto, Dto, Dto, Dto, Dto];
    expect(orgCreated).toMatchObject({
      organizationId,
      actor: { type: 'user', name: 'User a', onBehalfOfUserId: null },
      target: { type: 'organization', id: organizationId },
      metadata: { name: 'Acme' },
    });
    expect(founder.metadata).toEqual({ role: 'owner' });
    expect(created).toMatchObject({
      actor: { name: 'User a' },
      target: { type: 'invitation', id: invitationId },
      metadata: { email: b.email, role: 'recruiter' },
    });
    expect(accepted_).toMatchObject({ actor: { name: 'User b' }, target: { type: 'invitation', id: invitationId } });
    expect(memberAdded).toMatchObject({ actor: { name: 'User b' }, target: { type: 'member' }, metadata: { role: 'recruiter' } });
    expect(events.every((e) => e.organizationId === organizationId && !Number.isNaN(Date.parse(e.occurredAt)))).toBe(true);
    const times = events.map((e) => Date.parse(e.occurredAt));
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  it('reading the log does not add events to it', async () => {
    const a = await newUser('reader').signUp();
    await a.createOrganization('Quiet');
    const first = (await auditLog(a)).body.meta?.total;
    await auditLog(a);
    expect((await auditLog(a)).body.meta?.total).toBe(first);
  });

  it('records update, cancel, reject, role change and removal', async () => {
    const { owner, admin } = await organizationWithTeam();
    const x = await newUser('x').signUp();
    const y = await newUser('y').signUp();

    expect((await owner.post('/api/auth/organization/update', { data: { name: 'Acme Renamed' } })).status).toBe(200);
    const cancelled = await invite(owner, x, 'interviewer');
    expect((await owner.post('/api/auth/organization/cancel-invitation', { invitationId: cancelled.id })).status).toBe(200);
    const rejected = await invite(admin, y, 'hiring_manager');
    expect((await y.post('/api/auth/organization/reject-invitation', { invitationId: rejected.id })).status).toBe(200);

    const members = await owner.get<unknown>('/api/auth/organization/list-members');
    const memberList = (members.body as unknown as { members: { id: string; role: string }[] }).members;
    const target = memberList.find((m) => m.role === 'recruiter')!;
    expect((await owner.post('/api/auth/organization/update-member-role', { memberId: target.id, role: 'hiring_manager' })).status).toBe(200);
    expect((await owner.post('/api/auth/organization/remove-member', { memberIdOrEmail: target.id })).status).toBe(200);

    const events = ((await auditLog(owner, '?limit=100')).body.data as Dto[]).filter((e) => e.actor.name !== null);
    const find = (action: string) => events.find((e) => e.action === action)!;
    expect(find('organization.updated')).toMatchObject({ actor: { name: 'User owner' }, metadata: { name: 'Acme Renamed' } });
    expect(find('invitation.cancelled')).toMatchObject({ actor: { name: 'User owner' }, target: { id: cancelled.id } });
    expect(find('invitation.rejected')).toMatchObject({ actor: { name: 'User y' }, target: { id: rejected.id } });
    expect(find('member.role_changed')).toMatchObject({
      actor: { name: 'User owner' },
      target: { id: target.id },
      metadata: { previousRole: 'recruiter', role: 'hiring_manager' },
    });
    expect(find('member.removed')).toMatchObject({ actor: { name: 'User owner' }, target: { id: target.id }, metadata: { role: 'hiring_manager' } });
  });

  it('filters by action and paginates', async () => {
    const { owner } = await organizationWithTeam();
    const added = await auditLog(owner, '?action=member.added');
    expect(added.body.meta?.total).toBe(3);
    expect((added.body.data as Dto[]).every((e) => e.action === 'member.added')).toBe(true);
    const page2 = await auditLog(owner, '?limit=2&page=2');
    expect(page2.body).toMatchObject({ meta: { page: 2, limit: 2 } });
    expect((page2.body.data as Dto[]).length).toBe(2);
  });
});

describe('permissions', () => {
  it('a recruiter cannot read the audit log or invite; an admin can read it', async () => {
    const { recruiter, admin } = await organizationWithTeam();
    const denied = await auditLog(recruiter);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ success: false, data: null, error: { code: 'forbidden' } });

    const invitation = await recruiter.post('/api/auth/organization/invite-member', { email: uniqueEmail('z'), role: 'interviewer' });
    expect(invitation.status).toBe(403);
    expect((await auditLog(admin)).status).toBe(200);
  });

  it('an admin cannot assign the owner role', async () => {
    const { admin, owner } = await organizationWithTeam();
    const byInvitation = await admin.post('/api/auth/organization/invite-member', { email: uniqueEmail('o'), role: 'owner' });
    expect(byInvitation.status).toBe(403);

    const members = await owner.get<unknown>('/api/auth/organization/list-members');
    const target = (members.body as unknown as { members: { id: string; role: string }[] }).members.find((m) => m.role === 'recruiter')!;
    const promoted = await admin.post('/api/auth/organization/update-member-role', { memberId: target.id, role: 'owner' });
    expect(promoted.status).toBe(403);
  });

  it('refuses roles that are not domain roles', async () => {
    const { owner } = await organizationWithTeam();
    for (const role of ['member', 'admin,recruiter', 'superuser']) {
      const reply = await owner.post('/api/auth/organization/invite-member', { email: uniqueEmail('r'), role });
      expect(reply.status).toBe(400);
    }
  });

  it('organization deletion is disabled because the audit log must outlive the organization', async () => {
    const owner = await newUser('deleter').signUp();
    const organizationId = await owner.createOrganization('Keep');
    const reply = await owner.post('/api/auth/organization/delete', { organizationId });
    expect(reply.status).toBe(404);
    expect((await auditLog(owner)).status).toBe(200);
  });

  it('a removed member loses access even if their session still points at the organization', async () => {
    const { owner, admin } = await organizationWithTeam();
    expect((await auditLog(admin)).status).toBe(200);
    const members = await owner.get<unknown>('/api/auth/organization/list-members');
    const adminMember = (members.body as unknown as { members: { id: string; role: string }[] }).members.find((m) => m.role === 'admin')!;
    await owner.post('/api/auth/organization/remove-member', { memberIdOrEmail: adminMember.id });
    const after = await auditLog(admin);
    expect(after.status).toBe(403);
  });
});

describe('tenant isolation', () => {
  it('a second organization never sees the first one\'s events', async () => {
    const first = await organizationWithTeam();
    const other = await newUser('other').signUp();
    const otherOrg = await other.createOrganization('Other');

    const mine = (await auditLog(other, '?limit=100')).body.data as Dto[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.organizationId === otherOrg)).toBe(true);
    expect(mine.some((e) => e.organizationId === first.organizationId)).toBe(false);
    const theirs = (await auditLog(first.owner, '?limit=100')).body.data as Dto[];
    expect(theirs.every((e) => e.organizationId === first.organizationId)).toBe(true);
    expect(theirs.length).toBeGreaterThanOrEqual(5);
  });
});

describe('request handling', () => {
  it('is unauthenticated without a session', async () => {
    const reply = await newUser('anon').get('/api/v1/audit-log');
    expect(reply.status).toBe(401);
    expect(reply.body).toMatchObject({ success: false, data: null, error: { code: 'unauthenticated' } });
  });

  it('is forbidden without an active organization', async () => {
    const reply = await (await newUser('lonely').signUp()).get('/api/v1/audit-log');
    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, error: { code: 'forbidden' } });
  });

  it.each(['?page=0', '?limit=0', '?limit=101', '?page=abc', '?action=candidate.ranked'])('rejects %s with 422', async (query) => {
    const owner = await newUser('q').signUp();
    await owner.createOrganization('Query');
    const reply = await auditLog(owner, query);
    expect(reply.status).toBe(422);
    expect(reply.body).toMatchObject({ success: false, data: null, error: { code: 'validation_failed' } });
  });

  it('answers unknown routes in the envelope', async () => {
    const reply = await newUser('nf').get('/api/v1/nothing');
    expect(reply.status).toBe(404);
    expect(reply.body).toMatchObject({ success: false, error: { code: 'not_found' } });
  });

  it('rejects a wrong password and signs in with the right one', async () => {
    const person = await newUser('cookie').signUp();
    const bad = await newUser('cookie2').post('/api/auth/sign-in/email', { email: person.email, password: 'definitely-wrong-password' });
    expect(bad.status).toBe(401);
    const good = await newUser('cookie3').post('/api/auth/sign-in/email', { email: person.email, password: 'correct-horse-battery' });
    expect(good.status).toBe(200);
    expect(good.cookie).toContain('better-auth.session_token');
  });
});
