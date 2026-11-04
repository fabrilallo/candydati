import type { Client } from '@candydati/domain';
import type { PublicJobClientDirectory, PublicShortlistDeps, ShortlistDeps } from '../client-ports.js';
import { seedHrWorld, type HrSeedOptions, type TestHrDeps } from './hr-deps.js';
import { createClientStore, createInMemoryClients, createInMemoryJobClients, createInMemoryPublicJobClients, createInMemoryShortlists, type ClientStore } from './in-memory-clients.js';
import { ORG_A } from './candidate-seed.js';
import { createInMemoryErasure } from './in-memory-privacy-ops.js';

export type TestClientDeps = TestHrDeps &
  ShortlistDeps &
  PublicShortlistDeps & {
    readonly clientStore: ClientStore;
    readonly publicClients: PublicJobClientDirectory;
  };

export interface ClientSeedOptions extends HrSeedOptions {
  readonly clients?: readonly Client[];
  /** Turn "we recruit for clients" on for `org_a` (default true). */
  readonly agency?: boolean;
}

export const buildClient = (overrides: Partial<Client> = {}): Client => ({
  id: 'client_1',
  organizationId: ORG_A,
  name: 'Acme Test Client',
  website: 'https://client.example',
  logoUrl: null,
  contacts: [{ id: 'contact_1', name: 'Carla Contact', email: 'carla@client.example' }],
  archivedAt: null,
  createdBy: 'user_test',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * The HR world (`org_a`, job `job_1`, application `app_1` of candidate `cand_1`) plus clients and shortlists in memory.
 * `org_a` recruits for clients unless `agency: false`; `client_1` (contact `contact_1`) exists unless `clients` says otherwise.
 */
export async function seedClientWorld(options: ClientSeedOptions = {}): Promise<TestClientDeps> {
  const world = seedHrWorld(options);
  const clientStore = createClientStore({ clients: options.clients ?? [buildClient()] });
  if (options.agency ?? true) await world.organizationSettings.setAgency(ORG_A, { recruitsForClients: true, agencyAuthorization: 'Aut. test 1' }, new Date());
  return {
    ...world,
    clientStore,
    clients: createInMemoryClients(clientStore),
    jobClients: createInMemoryJobClients(clientStore),
    shortlists: createInMemoryShortlists(clientStore),
    publicClients: createInMemoryPublicJobClients(clientStore, world.organizationSettings),
    erasure: createInMemoryErasure({ ...world, clientStore }),
  } as TestClientDeps;
}
