import type { ClientRequest, IncomingHttpHeaders, RequestOptions } from 'node:http';
import { isIP } from 'node:net';
import { createPinnedLookup } from './http-poster.js';
import { isPublicAddress } from './ip-ranges.js';
import { JsonReaderError, TransientFailure } from './json-reader-errors.js';
import type { ReaderTarget } from './json-reader-hosts.js';

export type RequestFn = (options: RequestOptions) => ClientRequest;
export type Resolve = (host: string) => Promise<readonly string[]>;

/** One HTTP exchange whose headers arrived. `body` is the raw response; `close` ends it (and the timer) early. */
export interface Exchange {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: AsyncIterable<Uint8Array>;
  close(): void;
  /** True once the exchange timer fired: a body error after that is a timeout, not a network failure. */
  timedOut(): boolean;
}

/**
 * The addresses to pin: resolved once, every record public unless the test-only loopback switch is on. A private answer
 * is a refusal (`host_not_allowed`, never retried); a resolution failure is transient.
 */
export async function pinnedAddresses(host: string, resolve: Resolve, allowPrivate: boolean): Promise<readonly string[]> {
  let addresses: readonly string[];
  try {
    addresses = isIP(host) !== 0 ? [host] : await resolve(host);
  } catch {
    throw new TransientFailure('network');
  }
  if (addresses.length === 0) throw new TransientFailure('network');
  if (!allowPrivate && !addresses.every(isPublicAddress)) throw new JsonReaderError('host_not_allowed');
  return addresses;
}

/** A request body: only the token exchange sends one. */
export interface RequestBody {
  readonly method: 'POST';
  readonly body: string;
}

const requestOptions = (target: ReaderTarget, addresses: readonly string[], headers: Readonly<Record<string, string>>, send: RequestBody | undefined): RequestOptions & { servername?: string } => ({
  method: send?.method ?? 'GET',
  hostname: target.host,
  port: target.port,
  path: `${target.url.pathname}${target.url.search}`,
  headers: send === undefined ? headers : { ...headers, 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(send.body)) },
  lookup: createPinnedLookup(addresses),
  agent: false,
  ...(target.secure && isIP(target.host) === 0 ? { servername: target.host } : {}),
});

/**
 * Sends one GET to the pinned addresses (the hostname stays in `Host` and SNI) and resolves when the headers arrive.
 * The timer covers the whole exchange, body included: when it fires the request is destroyed and reading fails.
 */
export function openExchange(fn: RequestFn, target: ReaderTarget, addresses: readonly string[], headers: Readonly<Record<string, string>>, timeoutMs: number, send?: RequestBody): Promise<Exchange> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let settled = false;
    let req: ClientRequest;
    try {
      req = fn(requestOptions(target, addresses, headers, send));
    } catch {
      reject(new TransientFailure('network'));
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      req.destroy(new TransientFailure('timeout'));
    }, timeoutMs);
    const close = (): void => {
      clearTimeout(timer);
      req.destroy();
    };
    req.on('error', () => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new TransientFailure(timedOut ? 'timeout' : 'network'));
    });
    req.on('response', (res) => {
      settled = true;
      res.on('end', () => clearTimeout(timer));
      res.on('error', () => undefined);
      resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, close, timedOut: () => timedOut });
    });
    req.end(send?.body);
  });
}

/** Reads a body into memory, at most `maxBytes`: past it the exchange is closed and the read refused. */
export async function readCapped(exchange: Exchange, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of exchange.body) {
      size += chunk.length;
      if (size > maxBytes) {
        exchange.close();
        throw new JsonReaderError('source_invalid_response');
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (error instanceof JsonReaderError) throw error;
    throw new TransientFailure(exchange.timedOut() ? 'timeout' : 'network');
  }
  exchange.close();
  return Buffer.concat(chunks);
}
