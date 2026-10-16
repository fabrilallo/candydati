import { randomUUID } from 'node:crypto';
import type { DrizzleUnitOfWork, FileStorage, MigrationCommitRequestDeps, MigrationConnectorDeps, MigrationUndoDeps, TaskQueue } from '@candydati/core';
import { createConnectorRegistry, createSecretBox, type MigrationConnectorRegistry } from '@candydati/providers';

/**
 * What the operator-facing migration routes need: upload or connector start, preview, choices, confirm and undo. The work
 * itself runs in the worker. The api only seals connector credentials; it never opens them.
 */
export type MigrationRouteDeps = MigrationConnectorDeps & MigrationUndoDeps & MigrationCommitRequestDeps;

export interface MigrationInputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  /** `BETTER_AUTH_SECRET`: the worker derives the same key to open the credentials. */
  readonly authSecret: string;
  readonly connectors?: MigrationConnectorRegistry | undefined;
}

export function createMigrationDeps({ uow, files, queue, authSecret, connectors }: MigrationInputs): { readonly migrationDeps: MigrationRouteDeps } {
  const r = uow.repositories;
  return {
    migrationDeps: {
      auditLog: r.auditLog,
      transaction: uow.transaction,
      jobTeams: r.jobTeams,
      migrations: r.migrations,
      migrationIssues: r.migrationIssues,
      migratedRows: r.migratedRows,
      applications: r.applications,
      erasure: r.erasure,
      privacyNotices: r.privacyNotices,
      files,
      queue,
      sources: connectors ?? createConnectorRegistry(),
      secrets: createSecretBox(authSecret),
      newId: randomUUID,
      now: () => new Date(),
    },
  };
}
