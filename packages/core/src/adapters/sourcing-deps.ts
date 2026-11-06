import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { TaskQueue } from '../intake-ports.js';
import type { EmailSender, MessagingConfig } from '../messaging-ports.js';
import type { SourcingDeps } from '../sourcing-ports.js';
import type { DrizzleUnitOfWork } from './drizzle-repositories.js';
import { createSourcingFingerprint } from './sourcing-fingerprint.js';

export interface SourcingWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly queue: TaskQueue;
  readonly sender: EmailSender;
  readonly config: MessagingConfig;
  /** The instance secret (`BETTER_AUTH_SECRET`): keys the objection fingerprints. */
  readonly secret: string;
  readonly onMailError?: ((error: unknown) => void) | undefined;
}

/** The same sourcing dependencies for the api and the worker, on Postgres. */
export function createSourcingDeps({ uow, queue, sender, config, secret, onMailError }: SourcingWiring): SourcingDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    jobs: r.jobs,
    organizationSettings: r.organizationSettings,
    organizations: r.organizations,
    contacts: r.sourcedContacts,
    objections: r.sourcingObjections,
    existingCandidates: r.sourcingCandidates,
    queue,
    sender,
    config,
    onError: onMailError,
    newToken: () => randomBytes(24).toString('base64url'),
    hash: (value) => createHash('sha256').update(value).digest('hex'),
    fingerprint: createSourcingFingerprint(secret),
    newId: randomUUID,
    now: () => new Date(),
  };
}
