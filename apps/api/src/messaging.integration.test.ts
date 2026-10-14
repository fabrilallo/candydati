import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUser } from './testing/client.js';
import { createWorld, personForm, type World } from './testing/candidate-world.js';
import { postRaw, QUOTED, rawReply, sign, TIMESTAMP, tokenOf } from './testing/inbound.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

interface Template { id: string; kind: string; subject: string; body: string; isDefault: boolean }
interface Message { id: string; direction: string; status: string; subject: string; bodyText: string; unverifiedSender: boolean; sentBy: { id: string; name: string } | null }
interface Board { applications: { id: string }[] }

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const applicationsOf = async (w: World): Promise<string[]> =>
  (await w.owner.get<Board>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications.map((a) => a.id);

const apply = async (w: World, email = uniqueEmail('candidate')): Promise<{ id: string; email: string }> => {
  const before = new Set(await applicationsOf(w));
  expect((await w.submit(personForm({ email }))).statusCode).toBe(201);
  const id = (await applicationsOf(w)).find((a) => !before.has(a));
  return { id: id!, email };
};

const messagesOf = async (user: TestUser, applicationId: string) => (await user.get<Message[]>(`/api/v1/applications/${applicationId}/messages`)).body.data!;

describe('email settings', () => {
  it('shows the default identity, saves an own address and re-checks the domain', async () => {
    const w = await createWorld(t, 'Acme');
    const initial = await w.owner.get<{ senderName: string; fromAddress: string | null; domain: unknown; effectiveFrom: string }>('/api/v1/email-settings');
    expect(initial.body.data).toMatchObject({ senderName: 'Acme', fromAddress: null, domain: null });
    expect(initial.body.data!.effectiveFrom).toContain('jobs@mail.test.example');

    const saved = await w.owner.put<{ domain: { name: string; status: string } }>('/api/v1/email-settings', { senderName: 'Acme Careers', fromAddress: 'hr@acme.example' });
    expect(saved.status).toBe(200);
    expect(saved.body.data!.domain).toMatchObject({ name: 'acme.example', status: 'unsupported' });
    expect((await w.owner.post('/api/v1/email-settings/verify')).status).toBe(200);
    expect((await w.owner.put('/api/v1/email-settings', { senderName: '', fromAddress: null })).status).toBe(422);
  });

  it('is managed by owner and admin only, and readable by everyone', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.put('/api/v1/email-settings', { senderName: 'X', fromAddress: null })).status).toBe(403);
    expect((await recruiter.get('/api/v1/email-settings')).status).toBe(200);
    expect((await (await w.member('admin')).put('/api/v1/email-settings', { senderName: 'X', fromAddress: null })).status).toBe(200);
  });
});

describe('templates', () => {
  it('lists defaults, edits one, restores it and manages custom ones', async () => {
    const w = await createWorld(t);
    const list = (await w.owner.get<Template[]>('/api/v1/email-templates')).body.data!;
    expect(list.find((x) => x.id === 'default:receipt')).toMatchObject({ kind: 'receipt', isDefault: true });

    const edited = await w.owner.put<Template>('/api/v1/email-templates/default:receipt', { name: 'Ricevuta', kind: 'receipt', subject: 'Ciao {{ candidate.firstName }}', body: 'Risposta in {{ job.responseDays }} giorni' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ kind: 'receipt', isDefault: false });
    const afterEdit = (await w.owner.get<Template[]>('/api/v1/email-templates')).body.data!.filter((x) => x.kind === 'receipt');
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0]!.subject).toBe('Ciao {{ candidate.firstName }}');

    expect((await w.owner.delete(`/api/v1/email-templates/${edited.body.data!.id}`)).status).toBe(200);
    expect((await w.owner.get<Template[]>('/api/v1/email-templates')).body.data!.find((x) => x.kind === 'receipt')).toMatchObject({ id: 'default:receipt', isDefault: true });

    const custom = await w.owner.post<Template>('/api/v1/email-templates', { name: 'Invito', kind: 'custom', subject: 'Colloquio', body: 'Ciao {{ candidate.firstName }}' });
    expect(custom.status).toBe(201);
    expect((await w.owner.delete(`/api/v1/email-templates/${custom.body.data!.id}`)).status).toBe(200);
    expect((await w.owner.delete(`/api/v1/email-templates/${custom.body.data!.id}`)).status).toBe(404);
  });

  it('refuses an unknown variable when saving', async () => {
    const w = await createWorld(t);
    const reply = await w.owner.post('/api/v1/email-templates', { name: 'Bad', kind: 'custom', subject: 'Hi', body: '{{ candidate.salary }}' });
    expect(reply.status).toBe(422);
  });

  it('previews with the real values and reports unknown variables', async () => {
    const w = await createWorld(t);
    const { id } = await apply(w);
    const preview = await w.owner.post<{ subject: string; body: string; unknownVariables: string[] }>('/api/v1/email-templates/preview', {
      applicationId: id,
      subject: 'Per {{ job.title }}',
      body: 'Ciao {{ candidate.firstName }} {{ candidate.shoeSize }}',
    });
    expect(preview.body.data).toMatchObject({ subject: 'Per Backend Developer', unknownVariables: ['candidate.shoeSize'] });
    expect(preview.body.data!.body).toContain('Ciao Giulia');
  });

  it('is managed by owner, admin and recruiter only', async () => {
    const w = await createWorld(t);
    const manager = await w.member('hiring_manager');
    expect((await manager.get('/api/v1/email-templates')).status).toBe(403);
    expect((await manager.post('/api/v1/email-templates', { name: 'X', kind: 'custom', subject: 's', body: 'b' })).status).toBe(403);
    expect((await (await w.member('recruiter')).get('/api/v1/email-templates')).status).toBe(200);
  });
});

describe('sending', () => {
  it('queues one task per recipient on a bulk send and lists the conversation', async () => {
    const w = await createWorld(t);
    const ids = [(await apply(w)).id, (await apply(w)).id, (await apply(w)).id];
    const before = t.queue.jobs().filter((j) => j.name === 'email.send').length;
    const sent = await w.owner.post<{ queued: number }>('/api/v1/messages', { applicationIds: ids, subject: 'Novità {{ candidate.firstName }}', body: 'Per {{ job.title }}' });
    expect(sent.body.data).toMatchObject({ queued: 3 });
    expect(t.queue.jobs().filter((j) => j.name === 'email.send').length - before).toBe(3);
    const [message] = (await messagesOf(w.owner, ids[0]!)).filter((m) => m.direction === 'outbound' && m.subject.startsWith('Novità'));
    expect(message).toMatchObject({ status: 'queued', subject: 'Novità Giulia', sentBy: { name: 'Owner' } });
  });

  it('refuses unknown variables and unknown applications', async () => {
    const w = await createWorld(t);
    const { id } = await apply(w);
    expect((await w.owner.post('/api/v1/messages', { applicationIds: [id], subject: 's', body: '{{ nope }}' })).status).toBe(422);
    expect((await w.owner.post('/api/v1/messages', { applicationIds: ['missing'], subject: 's', body: 'b' })).status).toBe(404);
    expect((await w.owner.post('/api/v1/messages', { applicationIds: [], subject: 's', body: 'b' })).status).toBe(422);
  });

  it('lets hiring managers and interviewers read but not send', async () => {
    const w = await createWorld(t);
    const { id } = await apply(w);
    for (const role of ['hiring_manager', 'interviewer'] as const) {
      const user = await w.member(role);
      await w.joinTeam(user, role);
      expect((await user.post('/api/v1/messages', { applicationIds: [id], subject: 's', body: 'b' })).status).toBe(403);
      expect((await user.post('/api/v1/email-templates/preview', { applicationId: id, subject: 's', body: 'b' })).status).toBe(403);
      expect((await user.get(`/api/v1/applications/${id}/messages`)).status).toBe(200);
    }
    expect((await (await w.member('recruiter')).post('/api/v1/messages', { applicationIds: [id], subject: 's', body: 'b' })).status).toBe(200);
  });

  it('keeps organizations apart', async () => {
    const a = await createWorld(t, 'Alpha');
    const b = await createWorld(t, 'Beta');
    const { id } = await apply(a);
    expect((await b.owner.post('/api/v1/messages', { applicationIds: [id], subject: 's', body: 'b' })).status).toBe(404);
    expect((await b.owner.get(`/api/v1/applications/${id}/messages`)).status).toBe(404);
    expect((await b.owner.post('/api/v1/email-templates/preview', { applicationId: id, subject: 's', body: 'b' })).status).toBe(404);
    await a.owner.put('/api/v1/email-templates/default:receipt', { name: 'R', kind: 'receipt', subject: 'Solo Alpha', body: 'x' });
    expect((await b.owner.get<Template[]>('/api/v1/email-templates')).body.data!.some((x) => x.subject === 'Solo Alpha')).toBe(false);
  });
});

describe('receipt', () => {
  it('queues the receipt after an application, from the organization template', async () => {
    const w = await createWorld(t);
    await w.owner.put('/api/v1/email-templates/default:receipt', { name: 'R', kind: 'receipt', subject: 'Ricevuta per {{ job.title }}', body: 'Grazie {{ candidate.firstName }}' });
    const before = t.queue.jobs().filter((j) => j.name === 'email.send').length;
    const { id } = await apply(w);
    expect(t.queue.jobs().filter((j) => j.name === 'email.send').length - before).toBe(1);
    expect(await messagesOf(w.owner, id)).toMatchObject([{ direction: 'outbound', status: 'queued', subject: 'Ricevuta per Backend Developer', sentBy: { id: 'system' } }]);
  });
});

describe('inbound email', () => {
  it('attaches a signed reply to the application with the quoted history stripped', async () => {
    const w = await createWorld(t);
    const { id, email } = await apply(w);
    const token = await tokenOf(t, id);
    const body = rawReply({ token, from: `Giulia <${email}>` });
    const reply = await postRaw(t.app, body, sign(body));
    expect(reply.statusCode).toBe(202);
    const inbound = (await messagesOf(w.owner, id)).filter((m) => m.direction === 'inbound');
    expect(inbound).toHaveLength(1);
    expect(inbound[0]).toMatchObject({ status: 'received', unverifiedSender: false, bodyText: 'Grazie, sono disponibile giovedì.' });
    expect(inbound[0]!.bodyText).not.toContain(QUOTED.slice(2, 12));
  });

  it('rejects a bad or missing signature and stores nothing', async () => {
    const w = await createWorld(t);
    const { id, email } = await apply(w);
    const body = rawReply({ token: await tokenOf(t, id), from: email });
    expect((await postRaw(t.app, body, sign(body, 'another-secret-another-secret-123456'))).statusCode).toBe(401);
    expect((await postRaw(t.app, body, undefined)).statusCode).toBe(401);
    expect((await postRaw(t.app, body, sign(`${body}x`))).statusCode).toBe(401);
    expect((await postRaw(t.app, body, sign(body), null)).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/v1/inbound/email/resend', payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode).toBe(401);
    expect((await messagesOf(w.owner, id)).filter((m) => m.direction === 'inbound')).toHaveLength(0);
  });

  it('answers 202 and stores nothing for an unknown token', async () => {
    const body = rawReply({ token: 'a'.repeat(32), from: 'x@example.com' });
    expect((await postRaw(t.app, body, sign(body))).statusCode).toBe(202);
  });

  it('answers 202 for a signed body that is not an email', async () => {
    expect((await postRaw(t.app, 'not an email', sign('not an email'))).statusCode).toBe(202);
  });

  it('flags a sender other than the candidate', async () => {
    const w = await createWorld(t);
    const { id } = await apply(w);
    const body = rawReply({ token: await tokenOf(t, id), from: 'stranger@example.net' });
    expect((await postRaw(t.app, body, sign(body))).statusCode).toBe(202);
    expect((await messagesOf(w.owner, id)).find((m) => m.direction === 'inbound')).toMatchObject({ unverifiedSender: true });
  });

  it('refuses a replay: a signature over an old or future timestamp is not accepted, even when it is genuine', async () => {
    const w = await createWorld(t);
    const { id, email } = await apply(w);
    const body = rawReply({ token: await tokenOf(t, id), from: email });
    const now = Number(TIMESTAMP);
    for (const stamp of [String(now - 301), String(now + 120)]) {
      expect((await postRaw(t.app, body, sign(body, undefined, stamp), stamp)).statusCode).toBe(401);
    }
    expect((await messagesOf(w.owner, id)).filter((m) => m.direction === 'inbound')).toHaveLength(0);
  });

  it('stores a duplicate Message-ID once', async () => {
    const w = await createWorld(t);
    const { id, email } = await apply(w);
    const body = rawReply({ token: await tokenOf(t, id), from: email, messageId: '<same@client.example>' });
    expect((await postRaw(t.app, body, sign(body))).statusCode).toBe(202);
    expect((await postRaw(t.app, body, sign(body))).statusCode).toBe(202);
    expect((await messagesOf(w.owner, id)).filter((m) => m.direction === 'inbound')).toHaveLength(1);
  });

  it('is not subject to the origin check', async () => {
    const body = rawReply({ token: 'b'.repeat(32), from: 'x@example.com' });
    const reply = await t.app.inject({ method: 'POST', url: '/api/v1/inbound/email/raw', headers: { origin: 'https://evil.example', 'content-type': 'message/rfc822', 'x-tt-signature': sign(body), 'x-tt-timestamp': TIMESTAMP }, payload: body });
    expect(reply.statusCode).toBe(202);
  });
});
