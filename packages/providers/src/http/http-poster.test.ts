import { describe, expect, it, vi } from 'vitest';
import { createHttpPoster } from './http-poster.js';

const request = { url: 'https://hooks.example.com/in', headers: { 'x-tt-event': 'ping' }, body: '{"a":1}', timeoutMs: 10_000 };

describe('createHttpPoster', () => {
  it('posts JSON without following redirects and returns the status', async () => {
    const fetchImpl = vi.fn(async () => new Response('secret response body', { status: 200 }));
    const result = await createHttpPoster({ fetchImpl }).post(request);
    expect(result).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(request.url);
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', body: request.body });
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', 'x-tt-event': 'ping' });
  });

  it('reports a redirect as its own status, never following it', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    expect(await createHttpPoster({ fetchImpl }).post(request)).toEqual({ ok: true, status: 302 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps timeouts and network failures to short codes without leaking messages', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    expect(await createHttpPoster({ fetchImpl: async () => { throw timeout; } }).post(request)).toEqual({ ok: false, error: 'timeout' });
    expect(await createHttpPoster({ fetchImpl: async () => { throw new Error('connect ECONNREFUSED 10.0.0.1'); } }).post(request)).toEqual({ ok: false, error: 'network_error' });
  });

  it('stops reading a huge response body at the limit', async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const result = await createHttpPoster({ maxResponseBytes: 4096, fetchImpl: async () => new Response(body, { status: 200 }) }).post(request);
    expect(result).toEqual({ ok: true, status: 200 });
    expect(pulled).toBeLessThan(20);
  });
});
