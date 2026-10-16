import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createJsonReader, type JsonReader } from '../http/index.js';
import type { FixtureResource } from './fixtures/migration/teamtailor/responses.js';

/** TEST ONLY: a local Teamtailor-like API (JSON:API pages with `links.next`) a connector is pointed at. */
export type TestRoute = readonly FixtureResource[] | ((req: IncomingMessage, res: ServerResponse) => void) | { readonly raw: unknown };

export interface TestApi {
  /** `http://api.teamtailor.com:PORT`: the reader resolves that name to loopback. */
  readonly origin: string;
  readonly seen: IncomingMessage[];
  /** Path (no query) -> the items of a paged list, a raw JSON body, or a handler. */
  readonly routes: Map<string, TestRoute>;
  perPage: number;
  close(): Promise<void>;
}

export async function startTestApi(): Promise<TestApi> {
  const state = { origin: '', perPage: 2 };
  const seen: IncomingMessage[] = [];
  const routes = new Map<string, TestRoute>();
  const server = createServer((req, res) => {
    seen.push(req);
    const url = new URL(req.url ?? '/', 'http://x');
    const route = routes.get(url.pathname);
    if (typeof route === 'function') return route(req, res);
    if (route === undefined) return void res.writeHead(404).end();
    let body: unknown;
    if ('raw' in route) body = route.raw;
    else {
      const items = route as readonly FixtureResource[];
      const number = Number(url.searchParams.get('page[number]') ?? '1');
      const next = new URL(url);
      next.searchParams.set('page[number]', String(number + 1));
      body = { data: items.slice((number - 1) * state.perPage, number * state.perPage), links: number * state.perPage < items.length ? { next: `${state.origin}${next.pathname}${next.search}` } : {} };
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.origin = `http://api.teamtailor.com:${(server.address() as AddressInfo).port}`;
  return {
    origin: state.origin,
    seen,
    routes,
    get perPage() {
      return state.perPage;
    },
    set perPage(value: number) {
      state.perPage = value;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export const testReader = (hosts: readonly { exact: string }[] = [{ exact: 'api.teamtailor.com' }]): JsonReader =>
  createJsonReader({ allowedHosts: hosts, unsafeAllowLoopbackForTests: true, resolve: async () => ['127.0.0.1'], sleep: async () => undefined, maxRetries: 1, backoff: { baseMs: 1, maxMs: 2 } });
