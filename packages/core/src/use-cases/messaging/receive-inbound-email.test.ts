import { describe, expect, it } from 'vitest';
import { AuditWriteError, ValidationError } from '../../errors.js';
import { buildCandidate, buildApplication, failingAuditLog, seedMessagingWorld, ORG_A, ORG_B } from '../../testing/index.js';
import { addressOf, receiveInboundEmail, type InboundEmail } from './receive-inbound-email.js';

const TOKEN = 'a'.repeat(24);
const OTHER_TOKEN = 'b'.repeat(24);
const world = (options: Parameters<typeof seedMessagingWorld>[0] = {}) =>
  seedMessagingWorld({
    messaging: { conversations: [{ applicationId: 'app_1', organizationId: ORG_A, token: TOKEN }] },
    ...options,
  });
const email = (overrides: Partial<InboundEmail> = {}): InboundEmail => ({
  to: [`reply+${TOKEN}@in.platform.example`],
  from: 'Ada Lovelace <ADA@example.com>',
  subject: 'Re: Hi',
  text: 'Grazie, sono disponibile giovedì.',
  messageId: '<m1@mail.example>',
  receivedAt: new Date('2026-06-01T09:00:00Z'),
  ...overrides,
});
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('receiveInboundEmail', () => {
  it('stores the reply on the application with a system audit event', async () => {
    const deps = world();
    expect(await receiveInboundEmail(deps, email())).toEqual({ stored: true });
    const [message] = deps.messagingStore.read().messages;
    expect(message).toMatchObject({
      organizationId: ORG_A,
      applicationId: 'app_1',
      candidateId: 'cand_1',
      direction: 'inbound',
      status: 'received',
      subject: 'Re: Hi',
      bodyText: 'Grazie, sono disponibile giovedì.',
      rawText: 'Grazie, sono disponibile giovedì.',
      sentBy: null,
      unverifiedSender: false,
      inboundMessageId: '<m1@mail.example>',
      // Ordered by our reception time; the sender's Date header is kept as `sentAt`.
      createdAt: deps.now(),
      sentAt: new Date('2026-06-01T09:00:00Z'),
    });
    expect(deps.auditLog.events()).toHaveLength(1);
    expect(deps.auditLog.events()[0]).toMatchObject({
      organizationId: ORG_A,
      action: 'message.received',
      actor: { type: 'system', id: 'inbound_email', onBehalfOfUserId: null },
      target: { type: 'message', id: message?.id },
      metadata: { applicationId: 'app_1', unverifiedSender: false },
    });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('giovedì');
  });

  it('finds the token in any recipient, case-insensitively', async () => {
    const deps = world();
    const result = await receiveInboundEmail(deps, email({ to: ['x@y.it', `Reply+${TOKEN.toUpperCase()}@IN.platform.example`] }));
    expect(result.stored).toBe(true);
  });

  it('drops an unknown, malformed or missing token without storing or auditing', async () => {
    const deps = world();
    for (const to of [[`reply+${OTHER_TOKEN}@in.x`], ['reply+short@in.x'], ['someone@in.x'], [`reply+${TOKEN}`]]) {
      expect(await receiveInboundEmail(deps, email({ to }))).toEqual({ stored: false, reason: 'unknown_token' });
    }
    expect(deps.messagingStore.read().messages).toHaveLength(0);
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it('drops a conversation whose application or candidate is gone', async () => {
    const deps = world({ applications: [] });
    expect(await receiveInboundEmail(deps, email())).toEqual({ stored: false, reason: 'unknown_application' });
    const noCandidate = world({ candidates: [] });
    expect((await receiveInboundEmail(noCandidate, email())).stored).toBe(false);
  });

  it('flags a sender that is not the candidate instead of trusting it', async () => {
    const deps = world();
    await receiveInboundEmail(deps, email({ from: 'attacker@evil.example', messageId: '<m2>' }));
    await receiveInboundEmail(deps, email({ from: 'ada@example.com', messageId: '<m3>' }));
    const [flagged, trusted] = deps.messagingStore.read().messages;
    expect(flagged?.unverifiedSender).toBe(true);
    expect(trusted?.unverifiedSender).toBe(false);
    expect(deps.auditLog.events()[0]?.metadata).toMatchObject({ unverifiedSender: true });
  });

  it('dedupes by Message-ID, per organization', async () => {
    const deps = world();
    await receiveInboundEmail(deps, email());
    expect(await receiveInboundEmail(deps, email())).toEqual({ stored: false, reason: 'duplicate' });
    expect(deps.messagingStore.read().messages).toHaveLength(1);
    expect(deps.auditLog.events()).toHaveLength(1);
    const two = seedMessagingWorld({
      candidates: [buildCandidate({ organizationId: ORG_A }), buildCandidate({ id: 'cand_b', organizationId: ORG_B, email: 'ada@example.com' })],
      applications: [buildApplication({ organizationId: ORG_A }), buildApplication({ id: 'app_b', candidateId: 'cand_b', organizationId: ORG_B })],
      messaging: {
        conversations: [
          { applicationId: 'app_1', organizationId: ORG_A, token: TOKEN },
          { applicationId: 'app_b', organizationId: ORG_B, token: OTHER_TOKEN },
        ],
      },
    });
    await receiveInboundEmail(two, email());
    await expect(receiveInboundEmail(two, email({ to: [`reply+${OTHER_TOKEN}@in.x`] }))).resolves.toEqual({ stored: true });
    expect(two.messagingStore.read().messages.map((m) => m.organizationId)).toEqual([ORG_A, ORG_B]);
  });

  it('answers duplicate when the unique rule fires in a race', async () => {
    const deps = world();
    const real = deps.messages;
    const racy = { ...real, findByInboundMessageId: async () => null };
    await receiveInboundEmail({ ...deps, messages: real }, email());
    expect(await receiveInboundEmail({ ...deps, messages: racy }, email())).toEqual({ stored: false, reason: 'duplicate' });
  });

  it('extracts text from HTML when there is no plain part, and never stores HTML', async () => {
    const deps = world();
    await receiveInboundEmail(deps, email({ text: '  ', html: '<p>Ciao<script>x()</script></p><p>A &amp; B</p><img src=x onerror=alert(1)>' }));
    expect(deps.messagingStore.read().messages[0]?.bodyText).toBe('Ciao\n\nA & B');
    const [stored] = deps.messagingStore.read().messages;
    expect(`${stored?.bodyText}${stored?.rawText}`).not.toMatch(/[<>]/);
  });

  it('keeps the stripped body apart from the raw original, both capped and without NUL', async () => {
    const deps = world();
    await receiveInboundEmail(deps, email({ text: 'New text', rawText: 'New text\n> old\u0000', messageId: '<a>' }));
    await receiveInboundEmail(deps, email({ text: 'x'.repeat(30_000), rawText: 'y'.repeat(60_000), messageId: '<b>' }));
    const [a, b] = deps.messagingStore.read().messages;
    expect(a).toMatchObject({ bodyText: 'New text', rawText: 'New text\n> old' });
    expect(b?.bodyText).toHaveLength(20_000);
    expect(b?.rawText).toHaveLength(50_000);
  });

  it('never stores a date in the future, and normalizes the subject', async () => {
    const deps = world();
    await receiveInboundEmail(deps, email({ receivedAt: new Date('2099-01-01T00:00:00Z'), subject: 'a\r\nBcc: x\u0000' }));
    expect(deps.messagingStore.read().messages[0]).toMatchObject({ createdAt: deps.now(), subject: 'a Bcc: x' });
  });

  it('validates the payload and does not hide an unwritable audit log', async () => {
    expect(await rejection(receiveInboundEmail(world(), email({ to: [] })))).toBeInstanceOf(ValidationError);
    expect(await rejection(receiveInboundEmail(world(), email({ messageId: ' ' })))).toBeInstanceOf(ValidationError);
    const failing = world({ messagingOverrides: { auditLog: failingAuditLog(new Error('db')) } });
    expect(await rejection(receiveInboundEmail(failing, email()))).toBeInstanceOf(AuditWriteError);
  });

  it('stores the message and its audit event in one transaction: a failed audit leaves nothing, so the retry stores it (#12)', async () => {
    const deps = world();
    const failing = { ...deps, auditLog: failingAuditLog(new Error('db')) };
    expect(await rejection(receiveInboundEmail(failing, email()))).toBeInstanceOf(AuditWriteError);
    expect(deps.messagingStore.read().messages).toEqual([]);
    // The provider retries: not a duplicate, and this time it is audited.
    expect(await receiveInboundEmail(deps, email())).toEqual({ stored: true });
    expect(deps.auditLog.events().map((e) => e.action)).toEqual(['message.received']);
  });

  it('addressOf handles display names and bare addresses', () => {
    expect(addressOf('Ada <A@B.it>')).toBe('a@b.it');
    expect(addressOf(' a@b.it ')).toBe('a@b.it');
  });
});
