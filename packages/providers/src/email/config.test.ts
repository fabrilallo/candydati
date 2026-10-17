import { describe, expect, it } from 'vitest';
import { loadEmailConfig } from './config.js';

describe('loadEmailConfig', () => {
  it('defaults to the log provider', () => {
    const config = loadEmailConfig({});
    expect(config.transport).toEqual({ kind: 'log' });
    expect(config.fromLocal).toBe('noreply');
    expect(config.webhookSecret).toBeUndefined();
  });
  it('says whether EMAIL_PROVIDER comes from the environment (unset or empty: the app decides)', () => {
    expect(loadEmailConfig({}).fromEnvironment).toBe(false);
    expect(loadEmailConfig({ EMAIL_PROVIDER: '' }).fromEnvironment).toBe(false);
    expect(loadEmailConfig({ EMAIL_PROVIDER: 'log' }).fromEnvironment).toBe(true);
    expect(loadEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' }).fromEnvironment).toBe(true);
  });

  it('parses smtp', () => {
    const config = loadEmailConfig({
      EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: '1025', SMTP_SECURE: 'false', SMTP_USER: '',
      EMAIL_DOMAIN: 'example.com', EMAIL_INBOUND_DOMAIN: 'in.example.com', EMAIL_FROM_LOCAL: 'jobs',
    });
    expect(config.transport).toEqual({ kind: 'smtp', host: 'localhost', port: 1025, secure: false, user: undefined, password: undefined });
    expect(config.domain).toBe('example.com');
    expect(config.inboundDomain).toBe('in.example.com');
    expect(config.fromLocal).toBe('jobs');
  });
  it('parses resend', () => {
    expect(loadEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' }).transport).toEqual({ kind: 'resend', apiKey: 're_x' });
  });
  it('names missing variables without leaking values', () => {
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_HOST, SMTP_PORT/);
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: '' })).toThrow(/RESEND_API_KEY/);
    let message = '';
    try {
      loadEmailConfig({ EMAIL_PROVIDER: 'nope-secret-value' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('EMAIL_PROVIDER');
    expect(message).not.toContain('nope-secret-value');
  });
  it('rejects an invalid port', () => {
    expect(() => loadEmailConfig({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PORT: 'abc' })).toThrow(/SMTP_PORT/);
  });
  it('requires a 32+ char webhook secret when the webhook is enabled', () => {
    expect(() => loadEmailConfig({}, { requireWebhookSecret: true })).toThrow(/INBOUND_WEBHOOK_SECRET/);
    expect(() => loadEmailConfig({ INBOUND_WEBHOOK_SECRET: 'short' })).toThrow(/INBOUND_WEBHOOK_SECRET/);
    const secret = 's'.repeat(32);
    expect(loadEmailConfig({ INBOUND_WEBHOOK_SECRET: secret }, { requireWebhookSecret: true }).webhookSecret).toBe(secret);
  });
});
