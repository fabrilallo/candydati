import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { createJsonReader, JsonReaderError, type JsonReaderEvent, type JsonReaderOptions } from './json-reader.js';
import type { createPinnedLookup } from './http-poster.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let port = 0;
let seen: IncomingMessage[] = [];
let handlers: Handler[] = [];
const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Handler => (_req, res) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
};
const status = (code: number, headers: Record<string, string> = {}): Handler => (_req, res) => res.writeHead(code, headers).end();

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(req);
    const handler = handlers.length > 1 ? handlers.shift() : handlers[0];
    (handler ?? status(500))(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => {
  seen = [];
  handlers = [];
});

const HOST = 'api.example.com';
const base = () => `http://${HOST}:${port}`;
const page = z.object({ data: z.array(z.object({ id: z.string() })) });

const waits: number[] = [];
const events: JsonReaderEvent[] = [];
const reader = (overrides: Partial<JsonReaderOptions> = {}) => {
  waits.length = 0;
  events.length = 0;
  return createJsonReader({
    allowedHosts: [{ exact: HOST }],
    unsafeAllowLoopbackForTests: true,
    resolve: async () => ['127.0.0.1'],
    sleep: async (ms) => { waits.push(ms); },
    random: () => 1,
    backoff: { baseMs: 100, maxMs: 1000 },
    onEvent: (event) => events.push(event),
    ...overrides,
  });
};
const failure = async (promise: Promise<unknown>): Promise<JsonReaderError> => {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  if (!(error instanceof JsonReaderError)) throw new Error(`expected a JsonReaderError, got ${String(error)}`);
  return error;
};

describe('getJson', () => {
  it('reads a page, validates it and returns the headers, keeping the Host header', async () => {
    handlers = [json({ data: [{ id: '1' }] }, 200, { link: '<next>' })];
    const result = await reader().getJson(`${base()}/v1/jobs?page=1`, page, { headers: { authorization: 'Token token=abc' } });
    expect(result).toEqual({ data: { data: [{ id: '1' }] }, headers: expect.objectContaining({ link: '<next>' }) });
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/v1/jobs?page=1' });
    expect(seen[0]?.headers).toMatchObject({ host: `${HOST}:${port}`, authorization: 'Token token=abc', accept: 'application/json' });
  });

  it('refuses an answer that is not JSON or not the expected shape, without retrying', async () => {
    handlers = [(_req, res) => res.writeHead(200).end('<html>')];
    expect((await failure(reader().getJson(`${base()}/x`, page))).code).toBe('source_invalid_response');
    handlers = [json({ data: [{ id: 1, email: 'ada@example.com' }] })];
    const error = await failure(reader().getJson(`${base()}/x`, page));
    expect(error.code).toBe('source_invalid_response');
    expect(error.message).not.toContain('ada@example.com');
    expect(seen).toHaveLength(2);
  });

  it('stops reading a body past the cap', async () => {
    handlers = [(_req, res) => res.writeHead(200).end(Buffer.alloc(64 * 1024, 0x20))];
    expect((await failure(reader({ maxResponseBytes: 1024 }).getJson(`${base()}/x`, page))).code).toBe('source_invalid_response');
  });

  it('times out on a server that never answers, then gives up as unavailable', async () => {
    handlers = [() => undefined];
    expect((await failure(reader({ timeoutMs: 50, maxRetries: 1 }).getJson(`${base()}/x`, page))).code).toBe('source_unavailable');
    // The client gives up on its own clock: on a slow runner the server may log the second attempt a moment later.
    await vi.waitFor(() => expect(seen).toHaveLength(2));
  });

  it('times out while the body is still arriving', async () => {
    handlers = [(_req, res) => { res.writeHead(200); res.write('{"data":'); }];
    expect((await failure(reader({ timeoutMs: 50, maxRetries: 0 }).getJson(`${base()}/x`, page))).code).toBe('source_unavailable');
    expect((await failure(reader({ downloadTimeoutMs: 50, maxRetries: 0 }).download(`${base()}/x`, async (source) => (await collect(source)).length))).code).toBe('source_unavailable');
  });

  it('retries 503 with backoff, then succeeds', async () => {
    handlers = [status(503), status(502), json({ data: [] })];
    expect((await reader().getJson(`${base()}/x`, page)).data).toEqual({ data: [] });
    expect(waits).toEqual([100, 200]);
    expect(events.filter((e) => e.kind === 'retry').map((e) => e.status)).toEqual([503, 502]);
  });

  it('honours Retry-After on 429, and fails as rate limited when retries run out', async () => {
    handlers = [status(429, { 'retry-after': '3' }), json({ data: [] })];
    await reader().getJson(`${base()}/x`, page);
    expect(waits).toEqual([3000]);
    handlers = [status(429, { 'retry-after': '1' })];
    expect((await failure(reader({ maxRetries: 2 }).getJson(`${base()}/x`, page))).code).toBe('source_rate_limited');
    expect(waits).toEqual([1000, 1000]);
  });

  it('refuses to wait longer than maxWaitMs', async () => {
    handlers = [status(429, { 'retry-after': '3600' })];
    expect((await failure(reader().getJson(`${base()}/x`, page))).code).toBe('source_rate_limited');
    expect(seen).toHaveLength(1);
  });

  it('gives up on persistent 5xx as unavailable', async () => {
    handlers = [status(500)];
    expect((await failure(reader({ maxRetries: 1 }).getJson(`${base()}/x`, page))).code).toBe('source_unavailable');
  });

  it('waits for a spent rate window before the next request', async () => {
    handlers = [json({ data: [] }, 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2' }), json({ data: [] })];
    let now = 1_000;
    const r = reader({ now: () => now });
    await r.getJson(`${base()}/a`, page);
    now += 500;
    await r.getJson(`${base()}/b`, page);
    expect(waits).toEqual([1500]);
    expect(events.find((e) => e.kind === 'throttle')).toMatchObject({ waitMs: 1500 });
  });

  it('spaces requests with the token bucket', async () => {
    handlers = [json({ data: [] })];
    const r = reader({ rate: { capacity: 1, refillPerSecond: 2 }, now: () => 0 });
    await r.getJson(`${base()}/a`, page);
    await r.getJson(`${base()}/b`, page);
    expect(waits).toEqual([500]);
  });

  it.each([[401, 'credentials_refused'], [403, 'credentials_refused'], [404, 'not_found'], [400, 'source_invalid_response'], [304, 'source_invalid_response']])('maps %i to %s without retrying', async (code, expected) => {
    handlers = [status(code)];
    const error = await failure(reader().getJson(`${base()}/x`, page));
    expect([error.code, error.status]).toEqual([expected, code]);
    expect(seen).toHaveLength(1);
  });
});

describe('redirects', () => {
  it('follows a redirect on the same origin', async () => {
    handlers = [status(302, { location: '/v1/other?page=2' }), json({ data: [] })];
    await reader().getJson(`${base()}/v1/jobs`, page);
    expect(seen.map((r) => r.url)).toEqual(['/v1/jobs', '/v1/other?page=2']);
  });

  it('refuses a redirect to another host, port or scheme, a missing location and too many hops', async () => {
    for (const location of ['http://169.254.169.254/latest', `http://evil.example.com:${port}/`, `http://${HOST}:${port + 1}/`, `https://${HOST}:${port}/`]) {
      handlers = [status(302, { location })];
      expect((await failure(reader().getJson(`${base()}/x`, page))).code, location).toBe('redirect_refused');
    }
    handlers = [status(301)];
    expect((await failure(reader().getJson(`${base()}/x`, page))).code).toBe('redirect_refused');
    handlers = [status(307, { location: '/again' })];
    seen = [];
    expect((await failure(reader().getJson(`${base()}/x`, page))).code).toBe('redirect_refused');
    expect(seen).toHaveLength(4);
  });
});

describe('guards', () => {
  it('refuses loopback, http and other ports by default', async () => {
    const strict = createJsonReader({ allowedHosts: [{ exact: HOST }], resolve: async () => ['127.0.0.1'], sleep: async () => undefined });
    for (const url of [`${base()}/x`, `http://${HOST}/x`, `https://${HOST}:${port}/x`, `https://127.0.0.1/x`]) {
      expect((await failure(strict.getJson(url, page))).code, url).toBe('host_not_allowed');
    }
    expect((await failure(strict.getJson(`https://${HOST}/x`, page))).code).toBe('host_not_allowed');
    expect(seen).toHaveLength(0);
  });

  it('refuses hosts outside the allowlist and invalid rules', async () => {
    expect((await failure(reader().getJson(`http://evil.example.com:${port}/x`, page))).code).toBe('host_not_allowed');
    expect(() => createJsonReader({ allowedHosts: [{ subdomainOf: 'com' }] })).toThrow();
  });

  it('refuses a host resolving to a private address among public ones, and pins the validated address', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fake = ((opts: Record<string, unknown>) => { calls.push(opts); throw new Error('stop'); }) as never;
    const mixed = createJsonReader({ allowedHosts: [{ exact: HOST }], resolve: async () => ['93.184.216.34', '10.0.0.5'], sleep: async () => undefined, transport: { http: fake, https: fake } });
    expect((await failure(mixed.getJson(`https://${HOST}/x`, page))).code).toBe('host_not_allowed');
    expect(calls).toHaveLength(0);
    let answers = 0;
    const resolve = vi.fn(async () => (answers++ === 0 ? ['93.184.216.34'] : ['127.0.0.1']));
    const pinned = createJsonReader({ allowedHosts: [{ exact: HOST }], resolve, sleep: async () => undefined, maxRetries: 0, transport: { http: fake, https: fake } });
    expect((await failure(pinned.getJson(`https://${HOST}/x`, page))).code).toBe('source_unavailable');
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({ hostname: HOST, servername: HOST, port: 443, method: 'GET', agent: false });
    let all: unknown;
    (calls[0]?.lookup as ReturnType<typeof createPinnedLookup>)(HOST, { all: true }, (_e, a) => { all = a; });
    expect(all).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('treats a resolution failure as transient', async () => {
    const r = reader({ resolve: async () => { throw new Error('ENOTFOUND'); }, maxRetries: 1 });
    expect((await failure(r.getJson(`${base()}/x`, page))).code).toBe('source_unavailable');
    const empty = reader({ resolve: async () => [], maxRetries: 0 });
    expect((await failure(empty.getJson(`${base()}/x`, page))).code).toBe('source_unavailable');
  });

  it('never reports a token: events carry redacted URLs, errors carry codes', async () => {
    handlers = [status(503), status(401)];
    const error = await failure(reader().getJson(`${base()}/x?api_key=SUPERSECRET`, page, { headers: { authorization: 'Bearer SUPERSECRET' } }));
    expect(error.message).not.toContain('SUPERSECRET');
    expect(events.length).toBeGreaterThan(1);
    expect(JSON.stringify(events)).not.toContain('SUPERSECRET');
    expect(events[0]?.url).toBe(`${base()}/x?api_key=REDACTED`);
  });
});

const collect = async (source: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

describe('download', () => {
  it('streams a file to the store with its media type', async () => {
    handlers = [(_req, res) => res.writeHead(200, { 'content-type': 'application/pdf; charset=binary' }).end(Buffer.from('%PDF-1.7 hello'))];
    let stored: Buffer | undefined;
    const result = await reader().download(`${base()}/cv.pdf?sig=abc`, async (source, mediaType) => {
      stored = await collect(source);
      expect(mediaType).toBe('application/pdf');
      return stored.length;
    });
    expect(result).toEqual({ bytes: 14, mediaType: 'application/pdf' });
    expect(stored?.toString()).toBe('%PDF-1.7 hello');
  });

  it('stops past the download cap (declared or streamed): the store sees an error', async () => {
    handlers = [(_req, res) => res.writeHead(200, { 'content-length': '5000' }).end(Buffer.alloc(5000))];
    const store = vi.fn(async (source: AsyncIterable<Uint8Array>) => (await collect(source)).length);
    expect((await failure(reader({ maxDownloadBytes: 1000 }).download(`${base()}/f`, store))).code).toBe('source_invalid_response');
    expect(store).not.toHaveBeenCalled();
    handlers = [(_req, res) => { res.writeHead(200); res.write(Buffer.alloc(800)); res.end(Buffer.alloc(800)); }];
    expect((await failure(reader({ maxDownloadBytes: 1000 }).download(`${base()}/f`, store))).code).toBe('source_invalid_response');
  });

  it('retries before the first byte, never after it', async () => {
    handlers = [status(503), (_req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('ok')];
    expect(await reader().download(`${base()}/f`, async (source) => (await collect(source)).length)).toEqual({ bytes: 2, mediaType: 'text/plain' });
    handlers = [(_req, res) => { res.writeHead(200); res.write('partial'); setTimeout(() => res.destroy(), 20); }];
    seen = [];
    expect((await failure(reader().download(`${base()}/f`, async (source) => (await collect(source)).length))).code).toBe('source_unavailable');
    expect(seen).toHaveLength(1);
  });

  it('passes a storage failure through as it is', async () => {
    handlers = [(_req, res) => res.writeHead(200).end('data')];
    await expect(reader().download(`${base()}/f`, async () => { throw new Error('storage down'); })).rejects.toThrow('storage down');
  });
});

describe('postForm (token exchange)', () => {
  const token = z.object({ access_token: z.string(), token_type: z.string() });
  const form = { grant_type: 'client_credentials', note: 'a b&c' };
  const bodyOf = (req: IncomingMessage): Promise<string> => collect(req).then((b) => b.toString());

  it('posts an urlencoded form with the given headers, validates the answer and returns its headers', async () => {
    let received = '';
    handlers = [(req, res) => { void bodyOf(req).then((b) => { received = b; json({ access_token: 't', token_type: 'Bearer' }, 200, { 'x-ratelimit-remaining': '5' })(req, res); }); }];
    const result = await reader().postForm(`${base()}/token`, form, token, { headers: { authorization: 'Basic abc' } });
    expect(result.data).toEqual({ access_token: 't', token_type: 'Bearer' });
    expect(result.headers).toMatchObject({ 'x-ratelimit-remaining': '5' });
    expect(received).toBe('grant_type=client_credentials&note=a+b%26c');
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/token' });
    expect(seen[0]?.headers).toMatchObject({ authorization: 'Basic abc', 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(received.length), host: `${HOST}:${port}` });
  });

  it('refuses a shape it does not expect, without echoing the body', async () => {
    handlers = [json({ access_token: 'SECRETTOKEN', token_type: 5 })];
    const error = await failure(reader().postForm(`${base()}/token`, form, token));
    expect(error.code).toBe('source_invalid_response');
    expect(error.message).not.toContain('SECRETTOKEN');
  });

  it.each([[401, 'credentials_refused'], [403, 'credentials_refused'], [400, 'source_invalid_response'], [404, 'not_found']])('maps %i to %s without retrying', async (code, expected) => {
    handlers = [status(code)];
    expect((await failure(reader().postForm(`${base()}/token`, form, token))).code).toBe(expected);
    expect(seen).toHaveLength(1);
  });

  it('retries 5xx and honours Retry-After on 429, like a read', async () => {
    handlers = [status(503), status(429, { 'retry-after': '2' }), json({ access_token: 't', token_type: 'Bearer' })];
    await reader().postForm(`${base()}/token`, form, token);
    expect(waits).toEqual([100, 2000]);
    expect(seen.map((r) => r.method)).toEqual(['POST', 'POST', 'POST']);
  });

  it('never follows a redirect, not even on the same origin', async () => {
    handlers = [status(307, { location: '/elsewhere' })];
    expect((await failure(reader().postForm(`${base()}/token`, form, token))).code).toBe('redirect_refused');
    expect(seen).toHaveLength(1);
  });

  it('applies the host allowlist, https and the private-address guard', async () => {
    expect((await failure(reader().postForm(`http://evil.example.com:${port}/token`, form, token))).code).toBe('host_not_allowed');
    const strict = createJsonReader({ allowedHosts: [{ exact: HOST }], resolve: async () => ['10.0.0.5'], sleep: async () => undefined });
    expect((await failure(strict.postForm(`http://${HOST}/token`, form, token))).code).toBe('host_not_allowed');
    expect((await failure(strict.postForm(`https://${HOST}/token`, form, token))).code).toBe('host_not_allowed');
    expect(seen).toHaveLength(0);
  });

  it('caps the answer size and times out', async () => {
    handlers = [(_req, res) => res.writeHead(200).end(Buffer.alloc(64 * 1024, 0x20))];
    expect((await failure(reader({ maxResponseBytes: 1024 }).postForm(`${base()}/token`, form, token))).code).toBe('source_invalid_response');
    handlers = [() => undefined];
    expect((await failure(reader({ timeoutMs: 50, maxRetries: 0 }).postForm(`${base()}/token`, form, token))).code).toBe('source_unavailable');
  });

  it('never reports the form or the credentials: events and errors are redacted', async () => {
    handlers = [status(503), status(401)];
    const error = await failure(reader().postForm(`${base()}/token?client_secret=SUPERSECRET`, { client_secret: 'SUPERSECRET' }, token, { headers: { authorization: 'Basic SUPERSECRET' } }));
    expect(error.message).not.toContain('SUPERSECRET');
    expect(JSON.stringify(events)).not.toContain('SUPERSECRET');
  });
});
