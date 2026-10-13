import { describe, expect, it } from 'vitest';
import { checkWebhookUrl, webhookEndpointInputSchema } from './webhook.js';

describe('checkWebhookUrl', () => {
  it('accepts https', () => {
    expect(checkWebhookUrl('https://example.com/hook', false)).toBeNull();
  });

  it('refuses http in production, accepts http://localhost only with allowPrivate', () => {
    expect(checkWebhookUrl('http://example.com/hook', false)).toBe('https_required');
    expect(checkWebhookUrl('http://localhost:3000/hook', false)).toBe('https_required');
    expect(checkWebhookUrl('http://localhost:3000/hook', true)).toBeNull();
    expect(checkWebhookUrl('http://example.com/hook', true)).toBe('https_required');
  });

  it('refuses credentials, other schemes and garbage', () => {
    expect(checkWebhookUrl('https://user:pw@example.com', false)).toBe('credentials_not_allowed');
    expect(checkWebhookUrl('ftp://example.com', true)).toBe('invalid_url');
    expect(checkWebhookUrl('not a url', true)).toBe('invalid_url');
  });
});

describe('webhookEndpointInputSchema', () => {
  it('dedupes events and enables by default', () => {
    const parsed = webhookEndpointInputSchema.parse({ url: 'https://x.io', events: ['job.closed', 'job.closed'] });
    expect(parsed).toEqual({ url: 'https://x.io', events: ['job.closed'], enabled: true });
  });

  it('needs at least one known event', () => {
    expect(webhookEndpointInputSchema.safeParse({ url: 'https://x.io', events: [] }).success).toBe(false);
    expect(webhookEndpointInputSchema.safeParse({ url: 'https://x.io', events: ['ping'] }).success).toBe(false);
  });
});
