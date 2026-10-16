import { createInMemoryFileStorage } from '@candydati/core/testing';
import { MigrationFetchFailure, type MigrationFetchRequest } from '@candydati/core';
import { MIGRATION_LIMITS, migrationFilePrefix, migrationPackageKey } from '@candydati/domain';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createJsonReader } from '../http/index.js';
import { createFakeConnector } from '../testing/fake-connector.js';
import { defineMigrationConnector } from './connector.js';
import { createMigrationFetcher, type FetchErrorInfo } from './fetcher.js';
import { createMigrationPackageReader } from './package-reader.js';
import { createConnectorRegistry } from './registry.js';

const ORG = 'org_a';
const BATCH = 'mig_1';
const credentials = { apiKey: 'sk_test_12345678', subdomain: 'acme' };

const request = (overrides: Partial<MigrationFetchRequest> = {}): MigrationFetchRequest & { readonly seen: { progress: unknown[]; reserved: number[] } } => {
  const seen = { progress: [] as unknown[], reserved: [] as number[] };
  return {
    organizationId: ORG,
    batchId: BATCH,
    connectorId: 'fake-ats',
    credentials,
    filePrefix: migrationFilePrefix(ORG, BATCH),
    partKey: (index) => migrationPackageKey(ORG, index === 0 ? BATCH : `${BATCH}_p${index + 1}`),
    progress: async (done, total) => {
      seen.progress.push([done, total]);
    },
    reserveFiles: async (upTo) => {
      seen.reserved.push(upTo);
    },
    seen,
    ...overrides,
  };
};

describe('createMigrationFetcher', () => {
  it('runs the connector into one package the archive reader accepts, and leaves no temporary file', async () => {
    const files = createInMemoryFileStorage();
    let given: unknown;
    const fetcher = createMigrationFetcher({ registry: createConnectorRegistry([createFakeConnector({ onFetch: (c) => { given = c; } })]), files, now: () => new Date('2026-10-16T10:00:00Z') });
    const req = request();
    const result = await fetcher.fetch(req);
    expect(given).toEqual(credentials);
    expect(result.parts).toEqual([{ key: migrationPackageKey(ORG, BATCH), counts: { jobs: 2, candidates: 4, applications: 4, notes: 4, messages: 0, files: 4, bytes: expect.any(Number) } }]);
    expect(files.keys()).toEqual([migrationPackageKey(ORG, BATCH)]);
    expect(req.seen.reserved.at(-1)).toBe(4);
    expect(req.seen.progress.at(-1)).toEqual([4, 4]);
    const opened = await createMigrationPackageReader(files).open(migrationPackageKey(ORG, BATCH));
    if (!opened.ok) throw new Error(`refused: ${opened.code} ${opened.details.join(',')}`);
    expect(opened.package.manifest.source).toEqual({ system: 'fake-ats', producer: 'connector:fake-ats@1', exportedAt: '2026-10-16T10:00:00.000Z' });
    expect(opened.package.files.size).toBe(4);
    expect(opened.package.unreferenced).toEqual([]);
  });

  it('splits automatically into several packages when one would exceed the limits, each readable on its own', async () => {
    const files = createInMemoryFileStorage();
    const fetcher = createMigrationFetcher({ registry: createConnectorRegistry([createFakeConnector({ jobs: 3, perJob: 2 })]), files, limits: { ...MIGRATION_LIMITS, files: 2 } });
    const result = await fetcher.fetch(request());
    expect(result.parts.map((p) => p.key)).toEqual([migrationPackageKey(ORG, BATCH), migrationPackageKey(ORG, `${BATCH}_p2`), migrationPackageKey(ORG, `${BATCH}_p3`)]);
    for (const part of result.parts) {
      const opened = await createMigrationPackageReader(files).open(part.key);
      expect(opened.ok).toBe(true);
      expect(part.counts).toMatchObject({ jobs: 1, files: 2 });
    }
    expect(files.keys()).toHaveLength(3);
  });

  it.each([
    ['credentials_refused', 'credentials_refused'],
    ['source_rate_limited', 'source_rate_limited'],
    ['not_found', 'source_invalid_response'],
    ['host_not_allowed', 'source_unavailable'],
  ] as const)('turns a reader failure %s into the code %s, logging names only', async (failWith, code) => {
    const files = createInMemoryFileStorage();
    const logged: FetchErrorInfo[] = [];
    const fetcher = createMigrationFetcher({ registry: createConnectorRegistry([createFakeConnector({ failWith })]), files, onError: (info) => logged.push(info) });
    await expect(fetcher.fetch(request())).rejects.toEqual(new MigrationFetchFailure(code));
    expect(logged).toEqual([{ name: 'JsonReaderError', code: failWith }]);
  });

  it('reports a job too large for one package, rethrows an unexpected crash, and refuses an unknown connector or bad credentials', async () => {
    const files = createInMemoryFileStorage();
    const big = createMigrationFetcher({ registry: createConnectorRegistry([createFakeConnector({ jobs: 1, perJob: 3 })]), files, limits: { ...MIGRATION_LIMITS, files: 2 } });
    await expect(big.fetch(request())).rejects.toEqual(new MigrationFetchFailure('part_too_large'));
    expect(files.keys()).toEqual([]);
    const crash = createMigrationFetcher({ registry: createConnectorRegistry([createFakeConnector({ failWith: 'crash' })]), files });
    await expect(crash.fetch(request())).rejects.toThrow('fake connector crashed');
    await expect(crash.fetch(request({ connectorId: 'other' }))).rejects.toEqual(new MigrationFetchFailure('connector_unavailable'));
    await expect(crash.fetch(request({ credentials: { apiKey: 'x' } }))).rejects.toThrow();
  });

  it('deletes the parts already written and the temporary files when a later part fails', async () => {
    const base = createInMemoryFileStorage();
    const files = { ...base, keys: base.keys, putStream: async (key: string, source: AsyncIterable<Uint8Array>, type: string) => (key.endsWith(`${BATCH}_p2/package.zip`) ? Promise.reject(new Error('storage down')) : base.putStream(key, source, type)) };
    const fetcher = createMigrationFetcher({ registry: createConnectorRegistry([createFakeConnector({ jobs: 2, perJob: 1 })]), files, limits: { ...MIGRATION_LIMITS, files: 1 } });
    await expect(fetcher.fetch(request())).rejects.toThrow('storage down');
    expect(base.keys()).toEqual([]);
  });
});

describe('createMigrationFetcher with a real reader', () => {
  let server: Server;
  let port = 0;
  const auth: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      auth.push(req.headers.authorization ?? '');
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jobs: [{ id: '42', title: 'Data Engineer' }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('gives the connector a reader bound to its own hosts', async () => {
    const files = createInMemoryFileStorage();
    const hostsSeen: unknown[] = [];
    const connector = defineMigrationConnector({
      ...createFakeConnector(),
      credentials: z.strictObject({ apiKey: z.string(), subdomain: z.string() }),
      hosts: (c) => [{ exact: `${c.subdomain}.fake-ats.example.com` }],
      async fetch(c, builder, tools) {
        const page = await tools.reader.getJson(`http://${c.subdomain}.fake-ats.example.com:${port}/jobs`, z.object({ jobs: z.array(z.object({ id: z.string(), title: z.string() })) }), { headers: { authorization: `Bearer ${c.apiKey}` } });
        for (const job of page.data.jobs) builder.addJob({ ref: job.id, title: job.title, status: 'open', createdAt: '2025-01-10T09:00:00Z', stages: [] });
        await expect(tools.reader.getJson(`http://other.example.com:${port}/jobs`, z.unknown())).rejects.toMatchObject({ code: 'host_not_allowed' });
      },
    });
    const fetcher = createMigrationFetcher({
      registry: createConnectorRegistry([connector]),
      files,
      readerFor: (hosts) => {
        hostsSeen.push(hosts);
        return createJsonReader({ allowedHosts: hosts, unsafeAllowLoopbackForTests: true, resolve: async () => ['127.0.0.1'] });
      },
    });
    const result = await fetcher.fetch(request());
    expect(hostsSeen).toEqual([[{ exact: 'acme.fake-ats.example.com' }]]);
    expect(auth).toEqual(['Bearer sk_test_12345678']);
    expect(result.parts[0]?.counts.jobs).toBe(1);
  });
});
