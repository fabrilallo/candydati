import { describe, expect, it } from 'vitest';
import { applicationConsentSchema, consentAnswerSchema, publicConsentSchema } from './consent.js';

describe('consent wire schemas', () => {
  it('reads the public reconfirmation request with its privacy notice', () => {
    const parsed = publicConsentSchema.parse({
      organization: { name: 'Acme', slug: 'acme' },
      job: { title: 'Data Engineer' },
      privacyNotice: { version: 2, language: 'it', text: 't', contactEmail: 'p@acme.test', retentionDays: { selection: 180, talent_pool: 730 } },
      expiresAt: '2026-11-09T09:20:00.000Z',
    });
    expect(parsed.privacyNotice.version).toBe(2);
    expect(() => publicConsentSchema.parse({ organization: { name: 'Acme' }, notice: {} })).toThrow();
  });

  it('reads a to_renew consent without version, scopes or date', () => {
    expect(applicationConsentSchema.parse({ status: 'to_renew', privacyNoticeVersion: null, scopes: [], givenAt: null }).status).toBe('to_renew');
    expect(() => applicationConsentSchema.parse({ status: 'to_renew', privacyNoticeVersion: 0, scopes: [], givenAt: null })).toThrow();
  });

  it('reads the answer', () => {
    expect(consentAnswerSchema.parse({ status: 'declined' }).status).toBe('declined');
  });
});
