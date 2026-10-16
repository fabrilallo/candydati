import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { defaultCacheControl, registerNoStoreByDefault } from './cache-control.js';

describe('defaultCacheControl', () => {
  it.each([
    ['/api/v1/candidates', 'private, no-store'],
    ['/api/v1/candidates?q=ada', 'private, no-store'],
    ['/api/auth/get-session', 'private, no-store'],
    ['/api/v1/public/careers/acme', null],
    ['/api/v1/public/careers/acme?page=2', null],
    ['/health', null],
    ['/', null],
  ])('%s -> %s', (url, expected) => {
    expect(defaultCacheControl(url)).toBe(expected);
  });
});

describe('registerNoStoreByDefault', () => {
  it('sets private, no-store only where the route chose nothing', async () => {
    const app = Fastify();
    registerNoStoreByDefault(app);
    app.get('/api/v1/me', async () => ({ ok: true }));
    app.get('/api/v1/cached', async (_request, reply) => reply.header('cache-control', 'public, max-age=60').send({ ok: true }));
    app.get('/api/v1/public/jobs', async () => ({ ok: true }));
    expect((await app.inject('/api/v1/me')).headers['cache-control']).toBe('private, no-store');
    expect((await app.inject('/api/v1/cached')).headers['cache-control']).toBe('public, max-age=60');
    expect((await app.inject('/api/v1/public/jobs')).headers['cache-control']).toBeUndefined();
    await app.close();
  });
});
