import { z } from 'zod';
import {
  MigrationFetchFailure,
  type CredentialsBox,
  type MigrationFetchDeps,
  type MigrationFetcher,
  type MigrationFetchRequest,
  type MigrationPartCounts,
  type MigrationSource,
  type MigrationSourceCatalog,
} from '../migration-fetch-ports.js';
import { seedMigrationWorld, type MigrationSeedOptions, type TestMigrationDeps } from './migration-deps.js';

/** A connector as the catalog lists it: one secret API key of at least 8 characters, and a subdomain. */
export const FAKE_SOURCE: MigrationSource = {
  id: 'fake-ats',
  label: 'Fake ATS',
  maturity: 'beta',
  input: 'api',
  docsUrl: 'https://docs.example.com/api',
  fields: [
    { name: 'apiKey', label: { en: 'API key', it: 'Chiave API' }, type: 'password', secret: true },
    { name: 'subdomain', label: { en: 'Subdomain', it: 'Sottodominio' }, type: 'text', secret: false },
  ],
  credentials: z.strictObject({ apiKey: z.string().min(8), subdomain: z.string().regex(/^[a-z0-9-]{1,63}$/) }),
};

export const FAKE_CREDENTIALS = { apiKey: 'sk_live_very_secret_value', subdomain: 'acme' } as const;

export const fakeSourceCatalog = (sources: readonly MigrationSource[] = [FAKE_SOURCE]): MigrationSourceCatalog => ({
  list: () => sources,
  find: (id) => sources.find((source) => source.id === id),
});

const encode = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');
const decode = (text: string): string => Buffer.from(text, 'base64url').toString('utf8');

/**
 * Not encryption: reversible test sealing bound to its context, so tests can check that what is stored is not the plain
 * value and cannot be opened for another batch. Production uses the AES-GCM secret box of `@candydati/providers`.
 */
export const fakeCredentialsBox: CredentialsBox = {
  seal: (plaintext, context) => `fake1.${encode(context)}.${encode([...plaintext].toReversed().join(''))}`,
  open: (envelope, context) => {
    const [version, boundTo, body] = envelope.split('.');
    if (version !== 'fake1' || body === undefined || decode(boundTo ?? '') !== context) throw new Error('unauthentic');
    return [...decode(body)].toReversed().join('');
  },
};

export const partCounts = (overrides: Partial<MigrationPartCounts> = {}): MigrationPartCounts => ({
  jobs: 1,
  candidates: 2,
  applications: 3,
  notes: 0,
  messages: 0,
  files: 1,
  bytes: 100,
  ...overrides,
});

/** What the fake fetcher does: write `parts` packages, or fail. */
export type FakeFetchScript =
  | { readonly kind: 'parts'; readonly parts: readonly MigrationPartCounts[]; readonly progress?: readonly (readonly [number, number | null])[] }
  | { readonly kind: 'failure'; readonly code: MigrationFetchFailure['code'] }
  | { readonly kind: 'crash'; readonly error: Error };

export interface FakeFetcher extends MigrationFetcher {
  script(next: FakeFetchScript): void;
  /** Every request received, credentials included: only tests read them. */
  requests(): readonly MigrationFetchRequest[];
}

/** Writes a placeholder package at each part key, reports the scripted progress and reserves one file slot. */
export function createFakeFetcher(files: TestMigrationDeps['files']): FakeFetcher {
  let current: FakeFetchScript = { kind: 'parts', parts: [partCounts()] };
  let seen: readonly MigrationFetchRequest[] = [];
  return {
    script(next) {
      current = next;
    },
    requests: () => seen,
    async fetch(request) {
      seen = [...seen, request];
      await request.reserveFiles(1);
      if (current.kind === 'failure') throw new MigrationFetchFailure(current.code);
      if (current.kind === 'crash') throw current.error;
      for (const [done, total] of current.progress ?? []) await request.progress(done, total);
      const parts = [];
      for (const [index, counts] of current.parts.entries()) {
        const key = request.partKey(index);
        await files.put(key, new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'application/zip');
        parts.push({ key, counts });
      }
      return { parts };
    },
  };
}

export type TestMigrationFetchDeps = TestMigrationDeps & MigrationFetchDeps & { readonly fetcher: FakeFetcher };

/** The migration world plus the fake catalog, sealing box and fetcher, progress written on every call. */
export function seedMigrationFetchWorld(options: MigrationSeedOptions & { readonly fetchOverrides?: Partial<TestMigrationFetchDeps> } = {}): TestMigrationFetchDeps {
  const world = seedMigrationWorld(options);
  return {
    ...world,
    sources: fakeSourceCatalog(),
    secrets: fakeCredentialsBox,
    fetcher: createFakeFetcher(world.files),
    progressIntervalMs: 0,
    ...options.fetchOverrides,
  };
}
