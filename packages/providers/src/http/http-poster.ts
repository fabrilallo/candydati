import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type ClientRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { HttpPoster } from '@tt/core';
import { isPublicAddress } from './ip-ranges.js';

type RequestFn = (options: RequestOptions) => ClientRequest;

export interface HttpPosterOptions {
  readonly timeoutMs?: number | undefined;
  /** The response body is never used; at most this many bytes are drained, then the connection is dropped. */
  readonly maxResponseBytes?: number | undefined;
  /** `WEBHOOKS_ALLOW_PRIVATE`: local development only. Skips the public-address check on the pinned addresses. */
  readonly allowPrivate?: boolean | undefined;
  readonly resolve?: ((host: string) => Promise<readonly string[]>) | undefined;
  /** Test seam: the `node:http` / `node:https` request functions. */
  readonly transport?: { readonly http: RequestFn; readonly https: RequestFn } | undefined;
}

export const DEFAULT_POST_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

class PostError extends Error {
  constructor(readonly code: 'timeout' | 'network_error') {
    super(code);
  }
}

const resolveAll = async (host: string): Promise<readonly string[]> =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * A `lookup` for `net.connect` that never touches DNS: it answers only with the addresses that were already validated,
 * so a second resolution (DNS rebinding) cannot change where the socket goes.
 */
export function createPinnedLookup(addresses: readonly string[]): LookupFunction {
  const entries = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_hostname, options, callback) => {
    const wanted = options.family === 4 || options.family === 6 ? options.family : 0;
    const usable = wanted === 0 ? entries : entries.filter((entry) => entry.family === wanted);
    const first = usable[0];
    if (!first) {
      callback(Object.assign(new Error('no pinned address'), { code: 'ENOTFOUND' }), '', 4);
    } else if (options.all) {
      (callback as unknown as (e: null, a: typeof usable) => void)(null, usable);
    } else {
      callback(null, first.address, first.family);
    }
  };
}

/** The addresses to pin: every resolved record must be public (unless `allowPrivate`); an empty set is a refusal. */
async function validatedAddresses(host: string, allowPrivate: boolean, resolve: (h: string) => Promise<readonly string[]>): Promise<readonly string[]> {
  const addresses = isIP(host) !== 0 ? [host] : await resolve(host);
  if (addresses.length === 0) throw new PostError('network_error');
  if (!allowPrivate && !addresses.every(isPublicAddress)) throw new PostError('network_error');
  return addresses;
}

function send(fn: RequestFn, options: RequestOptions, body: string, timeoutMs: number, maxBytes: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const req = fn(options);
    const timer = setTimeout(() => {
      finish(() => reject(new PostError('timeout')));
      req.destroy();
    }, timeoutMs);
    req.on('error', () => finish(() => reject(new PostError('network_error'))));
    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      let read = 0;
      res.on('data', (chunk: Buffer) => {
        read += chunk.length;
        if (read >= maxBytes) {
          finish(() => resolve(status));
          req.destroy();
        }
      });
      res.on('end', () => finish(() => resolve(status)));
      res.on('error', () => finish(() => reject(new PostError('network_error'))));
    });
    req.end(body);
  });
}

/**
 * `HttpPoster` over `node:http(s)`, pinned against DNS rebinding: the host is resolved ONCE here, every address must be
 * public (unless `allowPrivate`), and the socket is forced to those addresses through a custom `lookup`. The URL
 * hostname stays in the `Host` header and in the TLS SNI/certificate check. Redirects are not followed (a 3xx is
 * returned as its status). The timeout covers the whole exchange. Neither body is ever logged or returned; errors
 * collapse to `timeout` or `network_error`, with no message that could echo a URL.
 */
export function createHttpPoster({
  timeoutMs = DEFAULT_POST_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  allowPrivate = false,
  resolve = resolveAll,
  transport = { http: httpRequest, https: httpsRequest },
}: HttpPosterOptions = {}): HttpPoster {
  return {
    async post(req) {
      try {
        const url = new URL(req.url);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new PostError('network_error');
        const secure = url.protocol === 'https:';
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const addresses = await validatedAddresses(host, allowPrivate, resolve);
        const options: RequestOptions & { servername?: string } = {
          method: 'POST',
          hostname: host,
          port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
          path: `${url.pathname}${url.search}`,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(req.body), ...req.headers },
          lookup: createPinnedLookup(addresses),
          agent: false,
          ...(secure && isIP(host) === 0 ? { servername: host } : {}),
        };
        const status = await send(secure ? transport.https : transport.http, options, req.body, Math.min(req.timeoutMs, timeoutMs), maxResponseBytes);
        return { ok: true, status };
      } catch (error) {
        return { ok: false, error: error instanceof PostError && error.code === 'timeout' ? 'timeout' : 'network_error' };
      }
    },
  };
}
