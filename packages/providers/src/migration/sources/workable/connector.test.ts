import { createInMemoryFileStorage } from '@candydati/core/testing';
import { MigrationFetchFailure, type MigrationFetchRequest } from '@candydati/core';
import { migrationConnectorDtoSchema, migrationFilePrefix, migrationPackageKey } from '@candydati/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createJsonReader, hostRuleFor } from '../../../http/index.js';
import { exampleActivities, exampleCandidate, workableAccount } from '../../../testing/workable-account.js';
import { startWorkable, type WorkableHarness } from '../../../testing/workable-harness.js';
import { createMigrationFetcher } from '../../fetcher.js';
import { createMigrationPackageReader } from '../../package-reader.js';
import { createConnectorRegistry } from '../../registry.js';
import { createWorkableConnector, workableConnector, workableCredentialsSchema } from './index.js';

let harness: WorkableHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('the Workable connector', () => {
  it('is a beta API connector with a described form: a plain subdomain and a secret token with a how-to link', () => {
    expect(workableConnector).toMatchObject({ id: 'workable', label: 'Workable', maturity: 'beta', input: 'api', docsUrl: 'https://workable.readme.io/reference' });
    expect(migrationConnectorDtoSchema.safeParse(workableConnector).success).toBe(true);
    const [subdomain, token] = workableConnector.fields;
    expect(subdomain).toMatchObject({ name: 'subdomain', secret: false, type: 'text' });
    expect(token).toMatchObject({ name: 'accessToken', secret: true, type: 'password', howToUrl: 'https://workable.readme.io/reference/generate-an-access-token' });
    for (const field of workableConnector.fields) {
      expect(field.label.en && field.label.it).toBeTruthy();
      expect(field.help?.en && field.help.it).toBeTruthy();
    }
  });

  it('reaches only {subdomain}.workable.com, and stays inside Workable\'s 10 requests per 10 seconds', () => {
    const credentials = workableCredentialsSchema.parse({ subdomain: 'acme', accessToken: 'wk_test_token_123456' });
    expect(workableConnector.hosts(credentials)).toEqual([{ subdomainOf: 'workable.com' }]);
    expect(workableConnector.hosts(credentials).map(hostRuleFor)).toHaveLength(1);
    const { capacity, refillPerSecond } = workableConnector.rate ?? { capacity: Infinity, refillPerSecond: Infinity };
    expect(capacity + 10 * refillPerSecond).toBeLessThanOrEqual(10);
  });

  it.each([
    ['acme', 'acme'],
    ['  ACME-2 ', 'acme-2'],
  ])('accepts the subdomain %j as %j', (given, expected) => {
    expect(workableCredentialsSchema.parse({ subdomain: given, accessToken: 'wk_test_token_123456' }).subdomain).toBe(expected);
  });

  it.each(['', 'acme.workable.com', 'a.b', 'https://acme', 'acme/spi', '-acme', 'acme-', 'a'.repeat(64), 'ac me', 'acme@evil.com'])('refuses the subdomain %j', (subdomain) => {
    expect(workableCredentialsSchema.safeParse({ subdomain, accessToken: 'wk_test_token_123456' }).success).toBe(false);
  });

  it('refuses a short token and any unknown field', () => {
    expect(workableCredentialsSchema.safeParse({ subdomain: 'acme', accessToken: 'short' }).success).toBe(false);
    expect(workableCredentialsSchema.safeParse({ subdomain: 'acme', accessToken: 'wk_test_token_123456', extra: 1 }).success).toBe(false);
  });
});

const ORG = 'org_a';
const BATCH = 'mig_1';
const request = (credentials: unknown, progress: unknown[] = []): MigrationFetchRequest => ({
  organizationId: ORG,
  batchId: BATCH,
  connectorId: 'workable',
  credentials,
  filePrefix: migrationFilePrefix(ORG, BATCH),
  partKey: (index) => migrationPackageKey(ORG, index === 0 ? BATCH : `${BATCH}_p${index + 1}`),
  progress: async (done, total) => {
    progress.push([done, total]);
  },
  reserveFiles: async () => undefined,
});

const fetcherFor = (server: WorkableHarness, files = createInMemoryFileStorage()) =>
  createMigrationFetcher({
    registry: createConnectorRegistry([createWorkableConnector({ unsafeBaseUrlForTests: () => server.baseUrl })]),
    files,
    now: () => new Date('2026-10-16T10:00:00Z'),
    readerFor: (hosts) => createJsonReader({ allowedHosts: hosts, unsafeAllowLoopbackForTests: true, resolve: async () => ['127.0.0.1'], sleep: async () => undefined, maxRetries: 0 }),
  });

describe('the Workable connector through the fetcher', () => {
  it('turns an account into a package the archive reader accepts', async () => {
    const files = createInMemoryFileStorage();
    harness = await startWorkable(() =>
      workableAccount({
        candidates: { '108d1748': exampleCandidate({}), ce4da98: exampleCandidate({ id: 'ce4da98', name: 'Lakita Marrero', firstname: 'Lakita', lastname: 'Marrero', email: 'lakita_marrero@gmail.com' }) },
        activities: { '108d1748': exampleActivities() },
      }),
    );
    const progress: unknown[] = [];
    const result = await fetcherFor(harness, files).fetch(request({ subdomain: 'acme', accessToken: 'wk_test_token_123456' }, progress));
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]?.counts).toMatchObject({ jobs: 3, candidates: 2, applications: 2, notes: 1, messages: 1, files: 0 });
    const opened = await createMigrationPackageReader(files).open(migrationPackageKey(ORG, BATCH));
    if (!opened.ok) throw new Error(`refused: ${opened.code} ${opened.details.join(',')}`);
    expect(opened.package.manifest.source).toMatchObject({ system: 'workable', producer: 'connector:workable@1' });
    expect(progress.length).toBeGreaterThanOrEqual(3);
    expect(harness.requests.every((r) => r.headers.authorization === 'Bearer wk_test_token_123456')).toBe(true);
  });

  it('says the credentials were refused when Workable answers 401, and never echoes the token', async () => {
    harness = await startWorkable(() => () => ({ status: 401, body: { error: 'Not authorized' } }));
    const error = await fetcherFor(harness).fetch(request({ subdomain: 'acme', accessToken: 'wk_test_token_123456' })).then(() => undefined, (e: unknown) => e);
    expect(error).toEqual(new MigrationFetchFailure('credentials_refused'));
    expect((error as Error).message).not.toContain('wk_test_token');
  });

  it('refuses a subdomain that is not one DNS label before any request', async () => {
    harness = await startWorkable(() => () => ({ body: {} }));
    await expect(fetcherFor(harness).fetch(request({ subdomain: 'evil.example.com/x', accessToken: 'wk_test_token_123456' }))).rejects.toThrow();
    expect(harness.requests).toHaveLength(0);
  });

  it('says the source is not available when Workable answers 500 (the scope is missing or the account is gone)', async () => {
    harness = await startWorkable(() => () => ({ status: 500, body: {} }));
    await expect(fetcherFor(harness).fetch(request({ subdomain: 'acme', accessToken: 'wk_test_token_123456' }))).rejects.toEqual(new MigrationFetchFailure('source_unavailable'));
  });
});
