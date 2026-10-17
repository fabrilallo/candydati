import { describe, expect, it, vi } from 'vitest';
import { loadEmailConfig } from './config.js';
import { createEmailRuntime, EMAIL_NOT_CONFIGURED_MESSAGE, type StoredEmailSettings } from './runtime.js';
import { EmailSendError, type EmailProvider } from './types.js';

const NO_ENV = loadEmailConfig({});
const STORED: StoredEmailSettings = {
  provider: 'smtp',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: 'apikey',
  secret: 'smtp-password',
  sendingDomain: 'mail.example.com',
  fromLocal: 'jobs',
  verifiedAt: new Date('2026-10-17T10:00:00Z'),
};
const MESSAGE = { from: 'a@mail.example.com', to: ['b@example.com'], subject: 's', text: 't' };

/** A provider factory that records the transport each provider was built for. */
const factory = () => {
  const built: unknown[] = [];
  const create = vi.fn((config: { transport: unknown }): EmailProvider => {
    built.push(config.transport);
    return { deduplicates: (config.transport as { kind: string }).kind === 'resend', send: vi.fn(async () => ({ providerMessageId: `m${built.length}` })), domainStatus: vi.fn(async () => ({ status: 'verified' as const, records: [] })) };
  });
  return { built, create };
};

describe('createEmailRuntime', () => {
  it('without environment nor stored settings: not ready, and a send fails as a retryable error', async () => {
    const runtime = createEmailRuntime({ env: NO_ENV, load: async () => null, log: () => undefined });
    await runtime.refresh();
    expect(runtime.snapshot()).toMatchObject({ source: 'none', transport: null });
    expect(runtime.ready()).toBe(false);
    const failure = await runtime.provider.send(MESSAGE).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({ transient: true, message: EMAIL_NOT_CONFIGURED_MESSAGE });
  });

  it('uses the settings saved from the app once loaded: transport, sending domain and local part', async () => {
    const { built, create } = factory();
    const runtime = createEmailRuntime({ env: NO_ENV, load: async () => STORED, log: () => undefined, createProvider: create });
    await runtime.refresh();
    expect(runtime.snapshot()).toMatchObject({ source: 'app', domain: 'mail.example.com', fromLocal: 'jobs', verifiedAt: STORED.verifiedAt });
    expect(runtime.ready()).toBe(true);
    await runtime.provider.send(MESSAGE);
    await runtime.provider.send(MESSAGE);
    expect(built).toEqual([{ kind: 'smtp', host: 'smtp.example.com', port: 587, secure: false, user: 'apikey', password: 'smtp-password' }]);
  });

  it('lets EMAIL_PROVIDER in the environment win over the stored settings', async () => {
    const { built, create } = factory();
    const env = loadEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_env', EMAIL_DOMAIN: 'env.example.com' });
    const load = vi.fn(async () => STORED);
    const runtime = createEmailRuntime({ env, load, log: () => undefined, createProvider: create });
    await runtime.refresh();
    expect(runtime.snapshot()).toMatchObject({ source: 'environment', domain: 'env.example.com' });
    await runtime.provider.send(MESSAGE);
    expect(built).toEqual([{ kind: 'resend', apiKey: 're_env' }]);
    expect(load).not.toHaveBeenCalled();
    expect(runtime.provider.deduplicates).toBe(true);
  });

  it('picks up a change at the next refresh and builds a new transport for it', async () => {
    const { built, create } = factory();
    let stored: StoredEmailSettings | null = null;
    const runtime = createEmailRuntime({ env: NO_ENV, load: async () => stored, log: () => undefined, createProvider: create });
    await runtime.refresh();
    expect(runtime.ready()).toBe(false);
    stored = { ...STORED, provider: 'resend', secret: 're_app', smtpHost: null, smtpPort: null, smtpUser: null };
    await runtime.refresh();
    await runtime.provider.send(MESSAGE);
    expect(built).toEqual([{ kind: 'resend', apiKey: 're_app' }]);
  });

  it('keeps the last good settings when loading fails, and says so without any secret', async () => {
    const lines: string[] = [];
    let fail = false;
    const runtime = createEmailRuntime({ env: NO_ENV, load: async () => (fail ? Promise.reject(new Error('db down')) : STORED), log: (line) => lines.push(line) });
    await runtime.refresh();
    fail = true;
    await runtime.refresh();
    expect(runtime.snapshot().source).toBe('app');
    expect(lines.join('\n')).toMatch(/email settings/);
    expect(lines.join('\n')).not.toContain('smtp-password');
  });

  it('reports a domain as unsupported while nothing can send', async () => {
    const runtime = createEmailRuntime({ env: NO_ENV, load: async () => null, log: () => undefined });
    await runtime.refresh();
    expect(await runtime.provider.domainStatus('example.com')).toEqual({ status: 'unsupported', records: [] });
  });
});
