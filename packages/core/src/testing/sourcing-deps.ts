import { createHash, createHmac } from 'node:crypto';
import type { SourcedContact } from '@candydati/domain';
import type { SourcingDeps } from '../sourcing-ports.js';
import { createInMemorySourcedContacts, createInMemorySourcingCandidateLookup, createInMemorySourcingObjections, type InMemorySourcedContacts, type InMemorySourcingObjections } from './in-memory-sourcing.js';
import { seedMessagingWorld, type MessagingSeedOptions, type TestMessagingDeps } from './messaging-deps.js';

export type TestSourcingDeps = TestMessagingDeps &
  SourcingDeps & {
    readonly contacts: InMemorySourcedContacts;
    readonly objections: InMemorySourcingObjections;
  };

export interface SourcingSeedOptions extends MessagingSeedOptions {
  readonly contacts?: readonly SourcedContact[];
}

const sha256 = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** The messaging world (`org_a`, job `job_1`, candidate `cand_1`) plus sourced contacts and objections, in memory. */
export function seedSourcingWorld(options: SourcingSeedOptions = {}): TestSourcingDeps {
  const world = seedMessagingWorld(options);
  return {
    ...world,
    contacts: createInMemorySourcedContacts(options.contacts),
    objections: createInMemorySourcingObjections(),
    existingCandidates: createInMemorySourcingCandidateLookup(() => world.store.read().candidates),
    hash: sha256,
    fingerprint: (organizationId, value) => createHmac('sha256', 'test-secret').update(`${organizationId}\u0000${value}`).digest('hex'),
  };
}
