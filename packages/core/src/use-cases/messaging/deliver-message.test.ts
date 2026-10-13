import { describe, expect, it } from 'vitest';
import {
  buildCandidate,
  buildEmailSettings,
  buildMessage,
  createFakeEmailSender,
  seedMessagingWorld,
  systemActor,
  ORG_A,
  ORG_B,
} from '../../testing/index.js';
import { ForbiddenError } from '../../errors.js';
import { deliverMessage } from './deliver-message.js';

const worker = systemActor({ organizationId: ORG_A });
const queued = (overrides = {}) => buildMessage({ organizationId: ORG_A, subject: 'Hi', bodyText: 'Hello <b>Ada</b>\n\nSee https://x.it', ...overrides });
const world = (options: Parameters<typeof seedMessagingWorld>[0] = {}) =>
  seedMessagingWorld({ messaging: { messages: [queued()], conversations: [{ applicationId: 'app_1', organizationId: ORG_A, token: 'a'.repeat(24) }] }, ...options });
const run = (deps: ReturnType<typeof world>, input = {}) => deliverMessage(deps, worker, { organizationId: ORG_A, messageId: 'msg_1', ...input });
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('deliverMessage', () => {
  it('sends with the default identity and the tokenized Reply-To, marks sent and audits', async () => {
    const deps = world();
    expect(await run(deps)).toBe('sent');
    expect(deps.sender.sent()).toEqual([
      {
        from: '"Acme via Platform" <jobs@mail.platform.example>',
        replyTo: `reply+${'a'.repeat(24)}@in.platform.example`,
        to: 'ada@example.com',
        subject: 'Hi',
        text: 'Hello <b>Ada</b>\n\nSee https://x.it',
        html: '<p>Hello &lt;b&gt;Ada&lt;/b&gt;</p>\n<p>See <a href="https://x.it" rel="noopener noreferrer">https://x.it</a></p>',
        headers: {},
        idempotencyKey: 'msg_1',
      },
    ]);
    expect(deps.messagingStore.read().messages[0]).toMatchObject({ status: 'sent', providerMessageId: 'provider-1', sentAt: deps.now(), error: null });
    expect(deps.auditLog.events()).toHaveLength(1);
    expect(deps.auditLog.events()[0]).toMatchObject({
      organizationId: ORG_A,
      action: 'message.sent',
      actor: { type: 'system' },
      target: { type: 'message', id: 'msg_1' },
      metadata: { applicationId: 'app_1', sentBy: 'user_test' },
    });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('Hello');
  });

  it('never turns the candidate name into a link, while the template links stay', async () => {
    const name = 'https://evil.example/login';
    const deps = world({
      candidates: [buildCandidate({ organizationId: ORG_A, firstName: name })],
      messaging: { messages: [queued({ bodyText: `Ciao ${name}\n\nApri https://good.example/x` })], conversations: [{ applicationId: 'app_1', organizationId: ORG_A, token: 'a'.repeat(24) }] },
    });
    expect(await run(deps)).toBe('sent');
    const html = deps.sender.sent()[0]?.html ?? '';
    expect(html).not.toContain('href="https://evil.example');
    expect(html).toContain('Ciao https://evil.example/login');
    expect(html).toContain('<a href="https://good.example/x"');
  });

  it('uses a verified own domain as From, never an unverified one', async () => {
    const verified = world({ messaging: { messages: [queued()], settings: [buildEmailSettings({ fromAddress: 'hr@acme.com', domain: 'acme.com', domainStatus: 'verified' })] } });
    await run(verified);
    expect(verified.sender.sent()[0]?.from).toBe('"Acme Careers" <hr@acme.com>');
    expect(verified.sender.sent()[0]?.replyTo).toMatch(/^reply\+[a-z2-7]{24,}@in\.platform\.example$/);
    const pending = world({ messaging: { messages: [queued()], settings: [buildEmailSettings({ fromAddress: 'hr@acme.com', domain: 'acme.com', domainStatus: 'unsupported' })] } });
    await run(pending);
    expect(pending.sender.sent()[0]?.from).toBe('"Acme Careers via Platform" <jobs@mail.platform.example>');
  });

  it('creates the conversation lazily and marks automatic messages', async () => {
    const deps = seedMessagingWorld({ messaging: { messages: [queued({ sentBy: 'system' })] } });
    await run(deps);
    expect(deps.messagingStore.read().conversations).toHaveLength(1);
    expect(deps.sender.sent()[0]?.headers).toEqual({ 'Auto-Submitted': 'auto-generated' });
    expect(deps.sender.sent()[0]?.replyTo).toContain(deps.messagingStore.read().conversations[0]?.token);
  });

  it('is idempotent: a sent, failed, inbound or unknown message is left alone', async () => {
    for (const messages of [
      [queued({ status: 'sent' })],
      [queued({ status: 'failed' })],
      [queued({ direction: 'inbound', status: 'received' })],
      [],
    ]) {
      const deps = seedMessagingWorld({ messaging: { messages } });
      expect(await run(deps)).toBe('skipped');
      expect(deps.sender.sent()).toHaveLength(0);
      expect(deps.auditLog.events()).toHaveLength(0);
    }
    const deps = world();
    await run(deps);
    expect(await run(deps)).toBe('skipped');
    expect(deps.sender.sent()).toHaveLength(1);
  });

  it('rethrows a transient error while retries remain, leaving the message queued', async () => {
    const deps = world({ messagingOverrides: { sender: createFakeEmailSender(new Error('smtp 451 secret-host')) } });
    expect(await rejection(run(deps, { lastAttempt: false }))).toBeInstanceOf(Error);
    expect(deps.messagingStore.read().messages[0]?.status).toBe('queued');
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('marks failed on the last attempt with a safe code, and audits', async () => {
    const deps = world({ messagingOverrides: { sender: createFakeEmailSender(new Error('smtp 451 secret-host')) } });
    expect(await run(deps)).toBe('failed');
    const [stored] = deps.messagingStore.read().messages;
    expect(stored).toMatchObject({ status: 'failed', error: 'delivery_failed', sentAt: null, providerMessageId: null });
    expect(JSON.stringify(stored)).not.toContain('secret-host');
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'message.failed', metadata: { error: 'delivery_failed' } });
  });

  it('does not retry a permanent rejection', async () => {
    const deps = world({ messagingOverrides: { sender: createFakeEmailSender(Object.assign(new Error('bad address'), { permanent: true })) } });
    expect(await run(deps, { lastAttempt: false })).toBe('failed');
    expect(deps.messagingStore.read().messages[0]?.error).toBe('delivery_rejected');
  });

  it('fails when the candidate no longer exists', async () => {
    const deps = world({ candidates: [] });
    expect(await run(deps)).toBe('failed');
    expect(deps.messagingStore.read().messages[0]?.error).toBe('recipient_missing');
    expect(deps.sender.sent()).toHaveLength(0);
  });

  it('sends once when the same task is delivered twice at the same time (#12)', async () => {
    const deps = world();
    const results = await Promise.all([run(deps), run(deps)]);
    expect(results.toSorted()).toEqual(['sent', 'skipped']);
    expect(deps.sender.sent()).toHaveLength(1);
    expect(deps.auditLog.events().filter((e) => e.action === 'message.sent')).toHaveLength(1);
  });

  it('does not send again when the outcome could not be recorded after the provider accepted it (#12)', async () => {
    const deps = world();
    const broken = { ...deps, auditLog: { ...deps.auditLog, append: async () => Promise.reject(new Error('db down')) } };
    expect(await rejection(run(broken))).toBeInstanceOf(Error);
    expect(deps.sender.sent()).toHaveLength(1);
    expect(deps.messagingStore.read().messages[0]?.status).toBe('sending');
    // Another task at the same time leaves the claim alone.
    expect(await run(deps)).toBe('skipped');
    // The retry finds the claim of an attempt that never finished: SMTP cannot drop a repeated send, so it is not resent.
    expect(await run(deps, { attempt: 2 })).toBe('failed');
    expect(deps.sender.sent()).toHaveLength(1);
    expect(deps.messagingStore.read().messages[0]).toMatchObject({ status: 'failed', error: 'delivery_unconfirmed' });
  });

  it('resends an unconfirmed claim with the same idempotency key when the provider drops repeats', async () => {
    const sender = Object.assign(createFakeEmailSender(), { deduplicates: true });
    const deps = world({ messagingOverrides: { sender } });
    deps.messagingStore.write({ messages: [queued({ status: 'sending' })] });
    expect(await run(deps, { attempt: 2 })).toBe('sent');
    expect(sender.sent().map((email) => email.idempotencyKey)).toEqual(['msg_1']);
  });

  it('puts a transiently failed claim back so the retry can take it', async () => {
    const deps = world({ messagingOverrides: { sender: createFakeEmailSender(new Error('smtp 451')) } });
    expect(await rejection(run(deps, { lastAttempt: false }))).toBeInstanceOf(Error);
    expect(deps.messagingStore.read().messages[0]?.status).toBe('queued');
  });

  it('does not touch a message of another organization', async () => {
    const deps = world();
    expect(await deliverMessage(deps, systemActor({ organizationId: ORG_B }), { organizationId: ORG_B, messageId: 'msg_1' })).toBe('skipped');
    expect(await rejection(deliverMessage(deps, systemActor({ organizationId: ORG_B }), { organizationId: ORG_A, messageId: 'msg_1' }))).toBeInstanceOf(ForbiddenError);
    expect(deps.sender.sent()).toHaveLength(0);
  });
});
