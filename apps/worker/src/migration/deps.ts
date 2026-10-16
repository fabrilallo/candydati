import { randomUUID } from 'node:crypto';
import type { DrizzleUnitOfWork, FileStorage, MigrationAnalysisDeps, MigrationCommitDeps, MigrationPurgeDeps, TaskQueue } from '@candydati/core';
import type { PlatformConfig } from '@candydati/domain';
import { createMigrationPackageReader, newConversationToken, sniffCv, toMessagingConfig, type EmailConfig } from '@candydati/providers';
import { hashConsentSecret, newConsentSecret } from '../import/deps.js';

export interface MigrationWorkerWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly platform: PlatformConfig;
  readonly email: EmailConfig;
}

export interface MigrationWorkerDeps {
  readonly analysis: MigrationAnalysisDeps;
  readonly commit: MigrationCommitDeps;
  readonly purge: MigrationPurgeDeps;
}

/**
 * Drizzle repositories, S3 and the package reader for the migration tasks. The commit asks people with no consent date
 * to reconfirm through the same path as the import (consent secret, hash, queued system message).
 */
export function createMigrationWorkerDeps({ uow, files, queue, platform, email }: MigrationWorkerWiring): MigrationWorkerDeps {
  const r = uow.repositories;
  const packages = createMigrationPackageReader(files);
  const analysis: MigrationAnalysisDeps = {
    transaction: uow.transaction,
    auditLog: r.auditLog,
    migrations: r.migrations,
    migrationIssues: r.migrationIssues,
    candidates: r.candidates,
    privacyNotices: r.privacyNotices,
    files,
    queue,
    cvSniffer: sniffCv,
    packages,
    newId: randomUUID,
    now: () => new Date(),
  };
  const commit: MigrationCommitDeps = {
    ...analysis,
    jobs: r.jobs,
    applications: r.applications,
    extractions: r.extractions,
    organizations: r.organizations,
    members: r.members,
    migratedRows: r.migratedRows,
    consentTokens: r.consentTokens,
    mail: { conversations: r.conversations, messages: r.messages, config: toMessagingConfig(platform, email), newToken: newConversationToken },
    newSecret: newConsentSecret,
    hash: hashConsentSecret,
  };
  return { analysis, commit, purge: analysis };
}
