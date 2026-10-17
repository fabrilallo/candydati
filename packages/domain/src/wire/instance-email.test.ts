import { describe, expect, it } from 'vitest';
import { instanceEmailSettingsInputSchema, instanceEmailSettingsSchema } from './instance-email.js';

const SMTP = { provider: 'smtp', smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'apikey', password: 'p' }, sendingDomain: 'mail.example.com', fromLocal: 'jobs' };

describe('instanceEmailSettingsInputSchema', () => {
  it('takes SMTP or Resend, lower-cases the sending domain and defaults the local part', () => {
    expect(instanceEmailSettingsInputSchema.parse({ ...SMTP, sendingDomain: 'Mail.Example.COM' })).toMatchObject({ sendingDomain: 'mail.example.com', fromLocal: 'jobs' });
    expect(instanceEmailSettingsInputSchema.parse({ provider: 'resend', resend: { apiKey: 're_x' }, sendingDomain: 'example.com' })).toMatchObject({ provider: 'resend', fromLocal: 'noreply' });
  });

  it('lets a secret be left out to keep the stored one', () => {
    expect(instanceEmailSettingsInputSchema.safeParse({ ...SMTP, smtp: { ...SMTP.smtp, password: undefined } }).success).toBe(true);
    expect(instanceEmailSettingsInputSchema.safeParse({ provider: 'resend', resend: {}, sendingDomain: 'example.com' }).success).toBe(true);
  });

  it('refuses what cannot send: no host, a bad port, a bad domain or local part, an unknown provider', () => {
    const bad = (value: object) => instanceEmailSettingsInputSchema.safeParse(value).success;
    expect(bad({ ...SMTP, smtp: { ...SMTP.smtp, host: '' } })).toBe(false);
    expect(bad({ ...SMTP, smtp: { ...SMTP.smtp, port: 0 } })).toBe(false);
    expect(bad({ ...SMTP, smtp: { ...SMTP.smtp, port: 70000 } })).toBe(false);
    expect(bad({ ...SMTP, sendingDomain: 'not a domain' })).toBe(false);
    expect(bad({ ...SMTP, fromLocal: 'no spaces' })).toBe(false);
    expect(bad({ ...SMTP, provider: 'log' })).toBe(false);
    expect(bad({ provider: 'smtp', sendingDomain: 'example.com' })).toBe(false);
  });
});

describe('instanceEmailSettingsSchema', () => {
  it('describes the settings without any secret', () => {
    const dto = instanceEmailSettingsSchema.parse({
      source: 'app',
      ready: true,
      canManage: true,
      provider: 'smtp',
      smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'apikey', hasPassword: true },
      resend: null,
      sendingDomain: 'mail.example.com',
      fromLocal: 'jobs',
      verifiedAt: '2026-10-17T10:00:00.000Z',
    });
    expect(JSON.stringify(dto)).not.toMatch(/password"|apiKey"/);
  });
});
