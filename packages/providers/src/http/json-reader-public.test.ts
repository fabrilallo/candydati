import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type RequestOptions, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { createJsonReader, JsonReaderError, type JsonReader, type JsonReaderEvent, type JsonReaderOptions } from './json-reader.js';
import type { createPinnedLookup } from './http-poster.js';
import type { RequestFn } from './json-reader-transport.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let port = 0;
let seen: IncomingMessage[] = [];
let handlers: Handler[] = [];
const status = (code: number, headers: Record<string, string> = {}): Handler => (_req, res) => res.writeHead(code, headers).end();
const file = (body: string, type = 'application/pdf'): Handler => (_req, res) => res.writeHead(200, { 'content-type': type }).end(body);

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

const API = 'api.example.com';
const STORAGE = 'files.storage.example.net';
const events: JsonReaderEvent[] = [];
const reader = (overrides: Partial<JsonReaderOptions> = {}): JsonReader => {
  events.length = 0;
  return createJsonReader({
    allowedHosts: [{ exact: API }],
    unsafeAllowLoopbackForTests: true,
    resolve: async () => ['127.0.0.1'],
    sleep: async () => undefined,
    random: () => 1,
    backoff: { baseMs: 1, maxMs: 2 },
    onEvent: (event) => events.push(event),
    ...overrides,
  });
};
const failure = async (promise: Promise<unknown>): Promise<JsonReaderError> => {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  if (!(error instanceof JsonReaderError)) throw new Error(`expected a JsonReaderError, got ${String(error)}`);
  return error;
};
const collect = async (source: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};
const keep = async (source: AsyncIterable<Uint8Array>): Promise<number> => (await collect(source)).length;

describe('downloadPublicFile against a local server (loopback test option)', () => {
  it('downloads from a host outside the allowlist, with no credentials and no caller headers', async () => {
    handlers = [file('%PDF-1.7 cv')];
    const result = await reader().downloadPublicFile(`http://${STORAGE}:${port}/bucket/cv.pdf?X-Amz-Signature=SIGNED`, keep);
    expect(result).toEqual({ bytes: 11, mediaType: 'application/pdf' });
    expect(seen[0]?.url).toBe('/bucket/cv.pdf?X-Amz-Signature=SIGNED');
    expect(seen[0]?.headers.host).toBe(`${STORAGE}:${port}`);
    expect(Object.keys(seen[0]?.headers ?? {}).sort()).toEqual(['accept', 'connection', 'host', 'user-agent']);
  });

  it('refuses any caller headers before sending anything', async () => {
    const r = reader() as unknown as { downloadPublicFile: (...args: unknown[]) => Promise<unknown> };
    for (const extras of [{ headers: { authorization: 'Bearer SECRET' } }, { headers: { cookie: 'session=SECRET' } }, { headers: {} }, {}]) {
      await expect(r.downloadPublicFile(`http://${STORAGE}:${port}/f`, keep, extras)).rejects.toThrow(TypeError);
    }
    expect(seen).toHaveLength(0);
  });

  it('follows a redirect to another host, re-resolving it, with no credentials', async () => {
    const resolve = vi.fn(async (_host: string) => ['127.0.0.1']);
    handlers = [status(302, { location: `http://cdn.example.org:${port}/signed/cv.pdf?sig=abc` }), file('data', 'text/plain')];
    expect(await reader({ resolve }).downloadPublicFile(`http://${STORAGE}:${port}/f`, keep)).toEqual({ bytes: 4, mediaType: 'text/plain' });
    expect(seen.map((r) => r.headers.host)).toEqual([`${STORAGE}:${port}`, `cdn.example.org:${port}`]);
    expect(resolve.mock.calls.map(([host]) => host)).toEqual([STORAGE, 'cdn.example.org']);
    expect(seen.every((r) => r.headers.authorization === undefined)).toBe(true);
  });

  it('refuses a redirect with user info, an odd scheme, no location or too many hops', async () => {
    for (const location of [`http://user:pass@cdn.example.org:${port}/`, 'ftp://cdn.example.org/f', 'file:///etc/passwd', `http://cdn.example.org.:${port}/`]) {
      handlers = [status(302, { location })];
      expect((await failure(reader().downloadPublicFile(`http://${STORAGE}:${port}/f`, keep))).code, location).toBe('redirect_refused');
    }
    handlers = [status(302)];
    expect((await failure(reader().downloadPublicFile(`http://${STORAGE}:${port}/f`, keep))).code).toBe('redirect_refused');
    handlers = [status(307, { location: `http://cdn.example.org:${port}/again` })];
    seen = [];
    expect((await failure(reader().downloadPublicFile(`http://${STORAGE}:${port}/f`, keep))).code).toBe('redirect_refused');
    expect(seen).toHaveLength(4);
  });

  it('caps the size (declared or streamed) and times out', async () => {
    handlers = [(_req, res) => res.writeHead(200, { 'content-length': '5000' }).end(Buffer.alloc(5000))];
    const store = vi.fn(keep);
    expect((await failure(reader({ maxDownloadBytes: 1000 }).downloadPublicFile(`http://${STORAGE}:${port}/f`, store))).code).toBe('source_invalid_response');
    expect(store).not.toHaveBeenCalled();
    handlers = [(_req, res) => { res.writeHead(200); res.write(Buffer.alloc(800)); res.end(Buffer.alloc(800)); }];
    expect((await failure(reader({ maxDownloadBytes: 1000 }).downloadPublicFile(`http://${STORAGE}:${port}/f`, keep))).code).toBe('source_invalid_response');
    handlers = [() => undefined];
    expect((await failure(reader({ downloadTimeoutMs: 50, maxRetries: 0 }).downloadPublicFile(`http://${STORAGE}:${port}/f`, keep))).code).toBe('source_unavailable');
  });

  it('reports only redacted URLs: the signature in the query never leaves the reader', async () => {
    handlers = [status(503), status(403)];
    const error = await failure(reader().downloadPublicFile(`http://${STORAGE}:${port}/cv.pdf?X-Amz-Signature=SUPERSECRET&X-Amz-Credential=KEY`, keep));
    expect(error.message).not.toContain('SUPERSECRET');
    expect(JSON.stringify(events)).not.toContain('SUPERSECRET');
    expect(events[0]?.url).toBe(`http://${STORAGE}:${port}/cv.pdf?X-Amz-Signature=REDACTED&X-Amz-Credential=REDACTED`);
  });

  it('ignores rate-limit headers of a foreign host: they never slow the vendor API', async () => {
    const waits: number[] = [];
    const r = reader({ sleep: async (ms) => { waits.push(ms); } });
    handlers = [(_req, res) => res.writeHead(200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '60' }).end('x'), (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{}')];
    await r.downloadPublicFile(`http://${STORAGE}:${port}/f`, keep);
    await r.getJson(`http://${API}:${port}/x`, z.object({}));
    expect(waits).toEqual([]);
  });
});

/** A fake https transport: answers per hostname, records the request options (pinned lookup, SNI). */
function fakeHttps(answers: Record<string, { readonly status: number; readonly headers?: Record<string, string>; readonly body?: string }>) {
  const calls: Array<RequestOptions & { servername?: string }> = [];
  const fn = ((opts: RequestOptions & { servername?: string }) => {
    calls.push(opts);
    const req = Object.assign(new EventEmitter(), {
      destroy: () => req,
      end: () => {
        const answer = answers[String(opts.hostname)] ?? { status: 500 };
        const res = Object.assign(Readable.from([Buffer.from(answer.body ?? '')]), { statusCode: answer.status, headers: answer.headers ?? {} });
        queueMicrotask(() => req.emit('response', res));
      },
    });
    return req;
  }) as unknown as RequestFn;
  return { fn, calls };
}

const pinnedTo = (opts: RequestOptions | undefined, host: string): unknown => {
  let all: unknown;
  (opts?.lookup as unknown as ReturnType<typeof createPinnedLookup>)(host, { all: true }, (_e, a) => { all = a; });
  return all;
};

describe('downloadPublicFile in production mode', () => {
  const DNS: Record<string, readonly string[]> = {
    [STORAGE]: ['93.184.216.34'],
    'cdn.example.org': ['2606:2800:220:1::1'],
    'internal.example.org': ['10.0.0.5'],
    'mixed.example.org': ['93.184.216.35', '127.0.0.1'],
    'metadata.example.org': ['169.254.169.254'],
  };
  const strict = (fn: RequestFn): JsonReader =>
    createJsonReader({ allowedHosts: [{ exact: API }], resolve: async (host) => DNS[host] ?? [], sleep: async () => undefined, maxRetries: 0, transport: { http: fn, https: fn } });

  it('refuses http, other ports, user info, IP literals that are not public and private or mixed answers, before any request', async () => {
    const { fn, calls } = fakeHttps({});
    const urls = [
      `http://${STORAGE}/f`,
      `https://${STORAGE}:8443/f`,
      `https://user:pass@${STORAGE}/f`,
      `https://${STORAGE}./f`,
      'https://127.0.0.1/f',
      'https://[::1]/f',
      'https://internal.example.org/f',
      'https://mixed.example.org/f',
      'https://metadata.example.org/f',
      'not a url',
    ];
    for (const url of urls) expect((await failure(strict(fn).downloadPublicFile(url, keep))).code, url).toBe('host_not_allowed');
    expect(calls).toHaveLength(0);
  });

  it('pins the connection to the validated address and keeps the hostname for SNI', async () => {
    const { fn, calls } = fakeHttps({ [STORAGE]: { status: 200, headers: { 'content-type': 'application/pdf' }, body: 'pdf' } });
    expect(await strict(fn).downloadPublicFile(`https://${STORAGE}/cv.pdf?sig=1`, keep)).toEqual({ bytes: 3, mediaType: 'application/pdf' });
    expect(calls[0]).toMatchObject({ hostname: STORAGE, servername: STORAGE, port: 443, method: 'GET', path: '/cv.pdf?sig=1', agent: false });
    expect(calls[0]?.headers).toEqual({ accept: '*/*', 'user-agent': 'candydati-migration' });
    expect(pinnedTo(calls[0], STORAGE)).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('follows an https redirect to a public host, re-resolved and pinned to its own addresses', async () => {
    const { fn, calls } = fakeHttps({
      [STORAGE]: { status: 302, headers: { location: 'https://cdn.example.org/blob?sig=2' } },
      'cdn.example.org': { status: 200, body: 'blob' },
    });
    expect((await strict(fn).downloadPublicFile(`https://${STORAGE}/f`, keep)).bytes).toBe(4);
    expect(calls[1]).toMatchObject({ hostname: 'cdn.example.org', servername: 'cdn.example.org', port: 443, path: '/blob?sig=2' });
    expect(pinnedTo(calls[1], 'cdn.example.org')).toEqual([{ address: '2606:2800:220:1::1', family: 6 }]);
  });

  it('refuses a redirect to http, another port, a private, mixed or metadata address', async () => {
    const targets = ['http://cdn.example.org/f', 'https://cdn.example.org:444/f', 'https://internal.example.org/f', 'https://mixed.example.org/f', 'https://metadata.example.org/f', 'https://169.254.169.254/latest'];
    for (const location of targets) {
      const { fn, calls } = fakeHttps({ [STORAGE]: { status: 302, headers: { location } } });
      expect((await failure(strict(fn).downloadPublicFile(`https://${STORAGE}/f`, keep))).code, location).toBe('redirect_refused');
      expect(calls).toHaveLength(1);
    }
  });

  it('keeps the authenticated download on the allowlist: a foreign host is refused there', async () => {
    const { fn, calls } = fakeHttps({});
    expect((await failure(strict(fn).download(`https://${STORAGE}/f`, keep, { headers: { authorization: 'Bearer x' } }))).code).toBe('host_not_allowed');
    expect(calls).toHaveLength(0);
  });
});
