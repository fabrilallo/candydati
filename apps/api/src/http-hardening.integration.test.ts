import { describe, expect, it } from 'vitest';
import { createTestApp } from './testing/test-app.js';

describe('CSRF on /api/v1', () => {
  it('rejects state-changing requests from an untrusted Origin, lets trusted and absent ones through', async () => {
    const t = await createTestApp();
    try {
      const send = (headers: Record<string, string>) => t.app.inject({ method: 'POST', url: '/api/v1/jobs/quality', headers, payload: { content: {} } });
      const evil = await send({ origin: 'https://evil.example' });
      expect(evil.statusCode).toBe(403);
      expect(JSON.parse(evil.body)).toMatchObject({ success: false, error: { code: 'forbidden' } });
      expect((await send({ origin: 'http://localhost:3100' })).statusCode).toBe(401);
      expect((await send({})).statusCode).toBe(401);
      const read = await t.app.inject({ method: 'GET', url: '/api/v1/jobs', headers: { origin: 'https://evil.example' } });
      expect(read.statusCode).toBe(401);
    } finally {
      await t.close();
    }
  });
});

describe('per-route limits and body size', () => {
  it('limits public routes and the quality route on their own budgets', async () => {
    const t = await createTestApp({ rateLimit: { max: 1000, authMax: 1000, publicMax: 2, qualityMax: 1 } });
    try {
      const pub = () => t.app.inject({ method: 'GET', url: '/api/v1/public/organizations/none/jobs' }).then((r) => r.statusCode);
      expect([await pub(), await pub(), await pub()]).toEqual([404, 404, 429]);
      const quality = () => t.app.inject({ method: 'POST', url: '/api/v1/jobs/quality', payload: { content: {} } });
      expect((await quality()).statusCode).toBe(401);
      const blocked = await quality();
      expect(blocked.statusCode).toBe(429);
      expect(JSON.parse(blocked.body).error.code).toBe('rate_limited');
      expect((await t.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    } finally {
      await t.close();
    }
  });

  it('refuses an ad body over 256 KB', async () => {
    const t = await createTestApp();
    try {
      const response = await t.app.inject({
        method: 'POST',
        url: '/api/v1/jobs/quality',
        payload: { content: { title: 'x'.repeat(300_000) } },
      });
      expect(response.statusCode).toBe(413);
      expect(JSON.parse(response.body).error.code).toBe('payload_too_large');
    } finally {
      await t.close();
    }
  });
});
