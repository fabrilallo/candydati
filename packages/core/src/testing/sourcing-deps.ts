import { createHash, createHmac } from 'node:crypto';
import type { SourcedContact } from '@candydati/domain';
import type { SourcingDeps } from '../sourcing-ports.js';
import { createInMemoryRiskAcceptances, createInMemorySourcedContacts, createInMemorySourcingCandidateLookup, createInMemorySourcingObjections, type InMemorySourcedContacts, type InMemorySourcingObjections } from './in-memory-sourcing.js';
import { createInMemoryOrganizationSettings } from './in-memory-job-requests.js';
import { seedMessagingWorld, type MessagingSeedOptions, type TestMessagingDeps } from './messaging-deps.js';

export type TestSourcingDeps = TestMessagingDeps &
  SourcingDeps & {
    readonly contacts: InMemorySourcedContacts;
    readonly objections: InMemorySourcingObjections;
  };

export interface SourcingSeedOptions extends MessagingSeedOptions {
  readonly contacts?: readonly SourcedContact[];
  /** The organization emails the notice at once to contacts with a known address. */
  readonly noticeByEmail?: boolean;
  /** LinkedIn sourcing on, with this many profiles at most per search. */
  readonly linkedin?: { readonly enabled: boolean; readonly maxPerRun: number };
}

const sha256 = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** The messaging world (`org_a`, job `job_1`, candidate `cand_1`) plus sourced contacts and objections, in memory. */
export function seedSourcingWorld(options: SourcingSeedOptions = {}): TestSourcingDeps {
  const world = seedMessagingWorld(options);
  return {
    ...world,
    contacts: createInMemorySourcedContacts(options.contacts),
    riskAcceptances: createInMemoryRiskAcceptances(),
    organizationSettings: createInMemoryOrganizationSettings({
      org_a: { sourcingNoticeByEmail: options.noticeByEmail ?? false, linkedinSourcingEnabled: options.linkedin?.enabled ?? false, linkedinMaxPerRun: options.linkedin?.maxPerRun ?? 20 },
    }),
    objections: createInMemorySourcingObjections(),
    existingCandidates: createInMemorySourcingCandidateLookup(() => world.store.read().candidates),
    hash: sha256,
    fingerprint: (organizationId, value) => createHmac('sha256', 'test-secret').update(`${organizationId}\u0000${value}`).digest('hex'),
  };
}
