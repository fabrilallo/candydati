import { describe, expect, it, vi } from 'vitest';
import { createEmailProvider } from './factory.js';
import { loadEmailConfig } from './config.js';
import { createLogEmailProvider } from './log.js';
import { createResendEmailProvider, mapResendDomainStatus } from './resend.js';
import { EmailSendError } from './types.js';

const message = { from: 'a@x.io', to: ['b@y.io'], subject: 'S', text: 'T' } as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('log provider', () => {
  it('logs counts only and reports domains as unsupported', async () => {
    const log = vi.fn();
    const provider = createLogEmailProvider(log);
    const result = await provider.send({ ...message, subject: 'secret-subject', text: 'secret-body' });
    expect(result.providerMessageId).toMatch(/^log-/);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).not.toMatch(/secret|y\.io/);
    expect(await provider.domainStatus('x.io')).toEqual({ status: 'unsupported', records: [] });
  });
});

describe('resend provider', () => {
  it('sends with headers and reply_to', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'res_1' }));
    const provider = createResendEmailProvider({ apiKey: 're_key', fetch: fetchMock });
    const result = await provider.send({
      ...message, replyTo: 'reply+t@in.io', html: '<p>T</p>',
      headers: { 'Auto-Submitted': 'auto-generated', 'In-Reply-To': '<m@x>', Empty: ' ' },
    });
    expect(result).toEqual({ providerMessageId: 'res_1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer re_key');
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'a@x.io', to: ['b@y.io'], subject: 'S', text: 'T', html: '<p>T</p>', reply_to: 'reply+t@in.io',
      headers: { 'Auto-Submitted': 'auto-generated', 'In-Reply-To': '<m@x>' },
    });
  });
  it('sends the idempotency key as a header, so a repeated delivery is dropped by Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'r' }));
    const provider = createResendEmailProvider({ apiKey: 'k', fetch: fetchMock });
    expect(provider.deduplicates).toBe(true);
    await provider.send({ ...message, idempotencyKey: 'msg_1' });
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('msg_1');
    expect(JSON.parse(String(init.body))).not.toHaveProperty('idempotencyKey');
  });
  it('omits optional fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'r' }));
    await createResendEmailProvider({ apiKey: 'k', fetch: fetchMock }).send(message);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      from: 'a@x.io', to: ['b@y.io'], subject: 'S', text: 'T',
    });
  });
  it.each([[500, true], [429, true], [422, false]])('classifies HTTP %i (transient %s)', async (status, transient) => {
    const provider = createResendEmailProvider({ apiKey: 'k', fetch: async () => json({ message: 'to leak' }, status) });
    const error = await provider.send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).transient).toBe(transient);
    expect((error as Error).message).not.toContain('leak');
  });
  it('treats network failures as transient and bad bodies as permanent', async () => {
    const down = createResendEmailProvider({ apiKey: 'k', fetch: async () => { throw new Error('boom'); } });
    expect(((await down.send(message).catch((e: unknown) => e)) as EmailSendError).transient).toBe(true);
    const bad = createResendEmailProvider({ apiKey: 'k', fetch: async () => json({}) });
    expect(((await bad.send(message).catch((e: unknown) => e)) as EmailSendError).transient).toBe(false);
  });
  it('gets an existing domain and maps records', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: 'd1', name: 'Mail.Example.com' }] }))
      .mockResolvedValueOnce(json({ id: 'd1', status: 'pending', records: [{ record: 'SPF', type: 'TXT', name: 'send', value: 'v=spf1', ttl: 'Auto' }] }));
    const result = await createResendEmailProvider({ apiKey: 'k', fetch: fetchMock }).domainStatus('mail.example.com');
    expect(result).toEqual({ status: 'pending', records: [{ type: 'TXT', name: 'send', value: 'v=spf1' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('creates the domain when missing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ id: 'd2', name: 'new.io' }))
      .mockResolvedValueOnce(json({ id: 'd2', status: 'verified' }));
    const result = await createResendEmailProvider({ apiKey: 'k', fetch: fetchMock }).domainStatus('new.io');
    expect(result).toEqual({ status: 'verified', records: [] });
    const post = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(post[1].method).toBe('POST');
    expect(JSON.parse(String(post[1].body))).toEqual({ name: 'new.io' });
  });
  it('maps statuses', () => {
    expect(mapResendDomainStatus('verified')).toBe('verified');
    expect(mapResendDomainStatus('failed')).toBe('failed');
    expect(mapResendDomainStatus('temporary_failure')).toBe('failed');
    expect(mapResendDomainStatus('not_started')).toBe('pending');
    expect(mapResendDomainStatus('pending')).toBe('pending');
  });
});

describe('createEmailProvider', () => {
  it('selects by config', async () => {
    const log = vi.fn();
    const logged = createEmailProvider(loadEmailConfig({}), log);
    expect((await logged.send(message)).providerMessageId).toMatch(/^log-/);
    const smtp = createEmailProvider(loadEmailConfig({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PORT: '25' }), log);
    expect((await smtp.domainStatus('x')).status).toBe('unsupported');
    const resend = createEmailProvider(loadEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }), log);
    expect(typeof resend.send).toBe('function');
  });
});
