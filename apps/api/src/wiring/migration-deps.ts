import { randomUUID } from 'node:crypto';
import type { DrizzleUnitOfWork, FileStorage, MigrationCommitRequestDeps, MigrationDeps, MigrationUndoDeps, TaskQueue } from '@candydati/core';

/** What the operator-facing migration routes need: upload, preview, choices, confirm and undo. The work itself runs in the worker. */
export type MigrationRouteDeps = MigrationDeps & MigrationUndoDeps & MigrationCommitRequestDeps;

export interface MigrationInputs {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
}

export function createMigrationDeps({ uow, files, queue }: MigrationInputs): { readonly migrationDeps: MigrationRouteDeps } {
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
      newId: randomUUID,
      now: () => new Date(),
    },
  };
}
