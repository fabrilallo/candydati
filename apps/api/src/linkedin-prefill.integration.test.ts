import { describe, expect, it } from 'vitest';
import { createTestApp } from './testing/test-app.js';

const LINKEDIN_ENV = { LINKEDIN_CLIENT_ID: 'test-client-id', LINKEDIN_CLIENT_SECRET: 'test-client-secret-not-real' };

describe('"Fill in with LinkedIn" wiring', () => {
  it('is off without the LinkedIn app: no button, no flow, the prefill answers none', async () => {
    const t = await createTestApp();
    try {
      expect((await t.app.inject({ url: '/api/v1/public/linkedin/status' })).json().data).toEqual({ enabled: false });
      expect((await t.app.inject({ url: '/api/v1/public/linkedin/start?return=%2Fcareers%2Facme%2Fjob' })).statusCode).toBe(404);
      const prefill = await t.app.inject({ method: 'POST', url: '/api/v1/public/linkedin/prefill', headers: { origin: 'http://localhost:3000' } });
      expect(prefill.json().data).toEqual({ status: 'none' });
    } finally {
      await t.close();
    }
  });

  it('sends the candidate to LinkedIn with the callback under PLATFORM_URL', async () => {
    const t = await createTestApp({ env: LINKEDIN_ENV });
    try {
      expect((await t.app.inject({ url: '/api/v1/public/linkedin/status' })).json().data).toEqual({ enabled: true });
      const started = await t.app.inject({ url: '/api/v1/public/linkedin/start?return=%2Fcareers%2Facme%2Fjob' });
      expect(started.statusCode).toBe(302);
      const location = new URL(String(started.headers.location));
      expect(`${location.origin}${location.pathname}`).toBe('https://www.linkedin.com/oauth/v2/authorization');
      expect(location.searchParams.get('client_id')).toBe('test-client-id');
      expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/v1/public/linkedin/callback');
      expect(location.searchParams.get('scope')).toBe('openid profile email');
      expect(String(started.headers.location)).not.toContain('test-client-secret-not-real');
    } finally {
      await t.close();
    }
  });

  it('refuses the prefill from another site and limits each client', async () => {
    const t = await createTestApp({ env: LINKEDIN_ENV, rateLimit: { max: 1000, authMax: 1000, linkedInMax: 2 } });
    try {
      const evil = await t.app.inject({ method: 'POST', url: '/api/v1/public/linkedin/prefill', headers: { origin: 'https://evil.example' } });
      expect(evil.statusCode).toBe(403);
      const status = () => t.app.inject({ url: '/api/v1/public/linkedin/status' }).then((response) => response.statusCode);
      expect([await status(), await status(), await status()]).toEqual([200, 200, 429]);
    } finally {
      await t.close();
    }
  });
});
