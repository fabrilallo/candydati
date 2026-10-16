import { EmailSendError, type EmailProvider } from './types.js';
import { loadPlatformConfig } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { newConversationToken, toEmailSender, toMessagingConfig } from './core-adapters.js';

const email = { from: 'a@x.it', replyTo: 'r@x.it', to: 'c@x.it', subject: 's', text: 't', html: '<p>t</p>', headers: {} };
const providerFailing = (error: Error): EmailProvider => ({
  send: async () => {
    throw error;
  },
  domainStatus: async () => ({ status: 'unsupported', records: [] }),
});

describe('toEmailSender', () => {
  it('marks a non transient provider error as permanent', async () => {
    await expect(toEmailSender(providerFailing(new EmailSendError('rejected', false))).send(email)).rejects.toMatchObject({ permanent: true });
  });

  it('keeps a transient error retryable', async () => {
    await expect(toEmailSender(providerFailing(new EmailSendError('busy', true))).send(email)).rejects.toMatchObject({ permanent: false });
    await expect(toEmailSender(providerFailing(new Error('socket'))).send(email)).rejects.not.toHaveProperty('permanent');
  });

  it('passes the message through and returns the provider id', async () => {
    const sent: unknown[] = [];
    const provider: EmailProvider = { send: async (m) => (sent.push(m), { providerMessageId: 'p1' }), domainStatus: async () => ({ status: 'unsupported', records: [] }) };
    expect(await toEmailSender(provider).send(email)).toEqual({ providerMessageId: 'p1' });
    expect(sent[0]).toMatchObject({ to: ['c@x.it'], replyTo: 'r@x.it' });
  });

  it('carries the idempotency key and says whether the provider honours it', async () => {
    const sent: unknown[] = [];
    const provider: EmailProvider = { deduplicates: true, send: async (m) => (sent.push(m), { providerMessageId: 'p1' }), domainStatus: async () => ({ status: 'unsupported', records: [] }) };
    const sender = toEmailSender(provider);
    expect(sender.deduplicates).toBe(true);
    await sender.send({ ...email, idempotencyKey: 'msg_1' });
    expect(sent[0]).toMatchObject({ idempotencyKey: 'msg_1' });
    expect(toEmailSender(providerFailing(new Error('x'))).deduplicates).toBe(false);
  });
});

describe('newConversationToken', () => {
  it('is base32 lowercase, long enough and unique', () => {
    const tokens = new Set(Array.from({ length: 50 }, newConversationToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[a-z2-7]{32}$/);
  });
});

describe('toMessagingConfig', () => {
  it('falls back to local domains', () => {
    const config = toMessagingConfig(loadPlatformConfig({ PLATFORM_NAME: 'P' }), { transport: { kind: 'log' }, fromLocal: 'jobs' });
    expect(config).toMatchObject({ platformName: 'P', emailFromLocal: 'jobs', emailDomain: 'localhost', emailInboundDomain: 'inbound.localhost' });
  });
});
