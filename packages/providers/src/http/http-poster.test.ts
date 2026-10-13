import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpPoster, createPinnedLookup } from './http-poster.js';

const resolvingTo = (...addresses: string[]) => async () => addresses;

interface Seen { headers: IncomingHttpHeaders; body: string; url: string }

let server: Server;
let port = 0;
let seen: Seen[] = [];
let respond: (res: ServerResponse) => void = (res) => res.writeHead(200).end('secret response body');

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      seen.push({ headers: req.headers, body, url: req.url ?? '' });
      respond(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => {
  seen = [];
  respond = (res) => res.writeHead(200).end('secret response body');
});

const request = (url: string, timeoutMs = 10_000) => ({ url, headers: { 'x-tt-event': 'ping' }, body: '{"a":1}', timeoutMs });

describe('createPinnedLookup', () => {
  it('answers only with the pinned addresses, whatever the hostname', () => {
    const lookup = createPinnedLookup(['93.184.216.34', '2606:4700::1']);
    let all: unknown;
    lookup('rebind.example.com', { all: true }, (_e, a) => { all = a; });
    expect(all).toEqual([{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1', family: 6 }]);
    let single: unknown[] = [];
    lookup('rebind.example.com', {}, (_e, a, f) => { single = [a, f]; });
    expect(single).toEqual(['93.184.216.34', 4]);
  });

  it('honours the requested family and fails on an empty set', () => {
    let v6: unknown[] = [];
    createPinnedLookup(['93.184.216.34', '2606:4700::1'])('x', { family: 6 }, (_e, a, f) => { v6 = [a, f]; });
    expect(v6).toEqual(['2606:4700::1', 6]);
    let error: unknown;
    createPinnedLookup([])('x', {}, (e) => { error = e; });
    expect(error).toBeInstanceOf(Error);
  });
});

describe('createHttpPoster pinning', () => {
  it('resolves once and connects to the validated address, keeping the Host header', async () => {
    const resolve = vi.fn(resolvingTo('127.0.0.1'));
    const result = await createHttpPoster({ allowPrivate: true, resolve }).post(request(`http://hooks.example.com:${port}/in?x=1`));
    expect(result).toEqual({ ok: true, status: 200 });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(seen[0]?.headers.host).toBe(`hooks.example.com:${port}`);
    expect(seen[0]).toMatchObject({ body: '{"a":1}', url: '/in?x=1' });
    expect(seen[0]?.headers).toMatchObject({ 'content-type': 'application/json', 'x-tt-event': 'ping' });
  });

  it('never reaches 127.0.0.1 when the validated set is public: a later rebind answer is not consulted', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fakeRequest = ((opts: Record<string, unknown>) => {
      calls.push(opts);
      throw new Error('stop');
    }) as never;
    // First answer public (check time); a real second lookup would say 127.0.0.1 and hit the server.
    let answers = 0;
    const resolve = async () => (answers++ === 0 ? ['93.184.216.34'] : ['127.0.0.1']);
    const result = await createHttpPoster({ resolve, transport: { http: fakeRequest, https: fakeRequest } }).post(request(`http://rebind.example.com:${port}/`));
    expect(result).toEqual({ ok: false, error: 'network_error' });
    const lookup = calls[0]?.lookup as ReturnType<typeof createPinnedLookup>;
    let all: unknown;
    lookup('rebind.example.com', { all: true }, (_e, a) => { all = a; });
    expect(all).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect(seen).toHaveLength(0);
  });

  it('keeps SNI on the original hostname over https', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fakeRequest = ((opts: Record<string, unknown>) => { calls.push(opts); throw new Error('stop'); }) as never;
    await createHttpPoster({ resolve: resolvingTo('93.184.216.34'), transport: { http: fakeRequest, https: fakeRequest } }).post(request('https://hooks.example.com/in'));
    expect(calls[0]).toMatchObject({ hostname: 'hooks.example.com', servername: 'hooks.example.com', port: 443, path: '/in', method: 'POST' });
  });

  it('refuses private answers, mixed answers and empty answers without connecting', async () => {
    for (const answers of [['127.0.0.1'], ['93.184.216.34', '10.0.0.5'], ['fe80::1'], []]) {
      const result = await createHttpPoster({ resolve: resolvingTo(...answers) }).post(request(`http://hooks.example.com:${port}/`));
      expect(result).toEqual({ ok: false, error: 'network_error' });
    }
    expect(await createHttpPoster({ resolve: async () => { throw new Error('ENOTFOUND'); } }).post(request(`http://x.example.com:${port}/`))).toEqual({ ok: false, error: 'network_error' });
    expect(seen).toHaveLength(0);
  });

  it('refuses a private literal host unless allowed', async () => {
    expect(await createHttpPoster().post(request(`http://127.0.0.1:${port}/`))).toEqual({ ok: false, error: 'network_error' });
    expect(await createHttpPoster({ allowPrivate: true }).post(request(`http://127.0.0.1:${port}/`))).toEqual({ ok: true, status: 200 });
  });

  it('refuses unsupported schemes and garbage URLs', async () => {
    expect(await createHttpPoster({ allowPrivate: true }).post(request('ftp://x.example.com'))).toEqual({ ok: false, error: 'network_error' });
    expect(await createHttpPoster({ allowPrivate: true }).post(request('nope'))).toEqual({ ok: false, error: 'network_error' });
  });

  it('connects over IPv6 with brackets stripped', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fakeRequest = ((opts: Record<string, unknown>) => { calls.push(opts); throw new Error('stop'); }) as never;
    await createHttpPoster({ transport: { http: fakeRequest, https: fakeRequest } }).post(request('https://[2606:4700:4700::1111]/in'));
    expect(calls[0]).toMatchObject({ hostname: '2606:4700:4700::1111' });
    const v6 = createHttpPoster({ allowPrivate: true, resolve: resolvingTo('::1') });
    const v6Server = createServer((_req, res) => res.writeHead(204).end());
    const bound = await new Promise<boolean>((done) => { v6Server.once('error', () => done(false)); v6Server.listen(0, '::1', () => done(true)); });
    if (bound) {
      const p = (v6Server.address() as AddressInfo).port;
      expect(await v6.post(request(`http://v6.example.com:${p}/`))).toEqual({ ok: true, status: 204 });
    }
    await new Promise((resolve) => v6Server.close(resolve));
  });
});

describe('createHttpPoster behaviour', () => {
  it('reports a redirect as its own status, never following it', async () => {
    respond = (res) => res.writeHead(302, { location: 'http://169.254.169.254/' }).end();
    const result = await createHttpPoster({ allowPrivate: true, resolve: resolvingTo('127.0.0.1') }).post(request(`http://hooks.example.com:${port}/`));
    expect(result).toEqual({ ok: true, status: 302 });
    expect(seen).toHaveLength(1);
  });

  it('times out on a server that never answers', async () => {
    respond = () => undefined;
    const result = await createHttpPoster({ allowPrivate: true, resolve: resolvingTo('127.0.0.1') }).post(request(`http://hooks.example.com:${port}/`, 100));
    expect(result).toEqual({ ok: false, error: 'timeout' });
  });

  it('uses the smaller of the configured and requested timeout', async () => {
    respond = () => undefined;
    const result = await createHttpPoster({ timeoutMs: 50, allowPrivate: true, resolve: resolvingTo('127.0.0.1') }).post(request(`http://hooks.example.com:${port}/`, 60_000));
    expect(result).toEqual({ ok: false, error: 'timeout' });
  });

  it('maps connection failures to a short code without leaking messages', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const p = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const result = await createHttpPoster({ allowPrivate: true, resolve: resolvingTo('127.0.0.1') }).post(request(`http://hooks.example.com:${p}/`));
    expect(result).toEqual({ ok: false, error: 'network_error' });
  });

  it('stops reading a huge response body at the limit', async () => {
    let written = 0;
    respond = (res) => {
      res.writeHead(200);
      const chunk = Buffer.alloc(16 * 1024);
      const pump = () => {
        while (!res.destroyed && written < 500 * 1024 * 1024) {
          written += chunk.length;
          if (!res.write(chunk)) { res.once('drain', pump); return; }
        }
      };
      pump();
    };
    const result = await createHttpPoster({ maxResponseBytes: 4096, allowPrivate: true, resolve: resolvingTo('127.0.0.1') }).post(request(`http://hooks.example.com:${port}/`));
    expect(result).toEqual({ ok: true, status: 200 });
    expect(written).toBeLessThan(50 * 1024 * 1024);
  });
});
