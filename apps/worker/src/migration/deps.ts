import { randomUUID } from 'node:crypto';
import type { DrizzleUnitOfWork, FileStorage, MigrationAnalysisDeps, TaskQueue } from '@candydati/core';
import { createMigrationPackageReader, sniffCv } from '@candydati/providers';

export interface MigrationWorkerWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
}

/** Drizzle repositories, S3 and the package reader for the migration tasks. */
export function createMigrationWorkerDeps({ uow, files, queue }: MigrationWorkerWiring): MigrationAnalysisDeps {
  const r = uow.repositories;
  return {
    transaction: uow.transaction,
    auditLog: r.auditLog,
    migrations: r.migrations,
    migrationIssues: r.migrationIssues,
    candidates: r.candidates,
    privacyNotices: r.privacyNotices,
    files,
    queue,
    cvSniffer: sniffCv,
    packages: createMigrationPackageReader(files),
    newId: randomUUID,
    now: () => new Date(),
  };
}
