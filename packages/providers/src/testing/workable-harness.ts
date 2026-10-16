import { createInMemoryFileStorage } from '@candydati/core/testing';
import { MIGRATION_PACKAGE_FORMAT, type MigrationPackageInput } from '@candydati/domain';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createJsonReader, type JsonReader } from '../http/index.js';
import { createPackageBuilder, type CollectingPackageBuilder } from '../migration/package-builder.js';

/**
 * TEST ONLY. A local stand-in for a Workable account: routes answer with the docs' example responses (see
 * `fixtures/migration/workable/`), and every request is recorded. Never part of a production build.
 */
export interface WorkableReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly raw?: Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
}
export type WorkableRoute = (url: URL, request: IncomingMessage) => WorkableReply | undefined;


export interface WorkableHarness {
  readonly port: number;
  readonly requests: { readonly url: URL; readonly headers: IncomingMessage['headers'] }[];
  /** `http://acme.workable.com:{port}`: a host the connector's `subdomainOf` rule accepts, resolved to this server. */
  readonly origin: string;
  readonly baseUrl: string;
  readonly reader: JsonReader;
  close(): Promise<void>;
}

const FIXTURES = new URL('./fixtures/migration/workable/', import.meta.url);

/** One of the docs' example responses, without its `_source` note. */
export function workableFixture<T = Record<string, unknown>>(name: string): T {
  const { _source, ...rest } = JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8')) as Record<string, unknown>;
  void _source;
  return rest as T;
}

export async function startWorkable(routes: (origin: string) => WorkableRoute): Promise<WorkableHarness> {
  let route: WorkableRoute = () => undefined;
  const requests: WorkableHarness['requests'][number][] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://local');
    requests.push({ url, headers: request.headers });
    const reply = route(url, request) ?? { status: 404, body: { error: 'Not found' } };
    const status = reply.status ?? 200;
    if (reply.raw !== undefined) response.writeHead(status, { 'content-type': 'application/pdf', ...reply.headers }).end(Buffer.from(reply.raw));
    else response.writeHead(status, { 'content-type': 'application/json', ...reply.headers }).end(JSON.stringify(reply.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://acme.workable.com:${port}`;
  route = routes(origin);
  const reader = createJsonReader({
    allowedHosts: [{ subdomainOf: 'workable.com' }],
    unsafeAllowLoopbackForTests: true,
    resolve: async () => ['127.0.0.1'],
    sleep: async () => undefined,
    maxRetries: 0,
  });
  return {
    port,
    requests,
    origin,
    baseUrl: `${origin}/spi/v3`,
    reader,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** A builder over in-memory storage, and a way to assemble what it collected into a package manifest. */
export function workableBuilder(options: { readonly maxFileBytes?: number } = {}): { readonly builder: CollectingPackageBuilder; readonly manifest: () => MigrationPackageInput; readonly keys: () => readonly string[] } {
  const files = createInMemoryFileStorage();
  const builder = createPackageBuilder({
    files,
    filePrefix: 'organizations/org_a/migrations/mig_1/',
    source: { system: 'workable', producer: 'connector:workable@1', exportedAt: '2026-10-16T10:00:00.000Z' },
    reserveFiles: async () => undefined,
    ...options,
  });
  return {
    builder,
    keys: () => files.keys(),
    manifest: () => {
      const { source, users, jobs, candidates, applications, notes, messages } = builder.collected();
      return { format: MIGRATION_PACKAGE_FORMAT, version: 1, source, users: [...users], jobs: [...jobs], candidates: [...candidates], applications: [...applications], notes: [...notes], messages: [...messages] } as MigrationPackageInput;
    },
  };
}
