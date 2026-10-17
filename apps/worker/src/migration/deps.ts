import type { MessagingConfig } from '@candydati/core';
import { randomUUID } from 'node:crypto';
import type { DrizzleUnitOfWork, FileStorage, MigrationAnalysisDeps, MigrationCommitDeps, MigrationFetchDeps, MigrationPurgeDeps, TaskQueue } from '@candydati/core';
import {
  createConnectorRegistry,
  createMigrationFetcher,
  createMigrationPackageReader,
  createSecretBox,
  newConversationToken,
  sniffAttachment,
  sniffCv,
  type FetchErrorInfo,
  type MigrationConnectorRegistry,
} from '@candydati/providers';
import { hashConsentSecret, newConsentSecret } from '../import/deps.js';

export interface MigrationWorkerWiring {
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  /** Live: the From and Reply-To domains follow the instance email settings. */
  readonly config: MessagingConfig;
  /** `BETTER_AUTH_SECRET`: the connector credentials are sealed with a key derived from it. */
  readonly authSecret: string;
  /** The built-in connectors by default. */
  readonly connectors?: MigrationConnectorRegistry | undefined;
  /** Names and codes of a failed fetch, never values. */
  readonly onFetchError?: ((info: FetchErrorInfo) => void) | undefined;
}

export interface MigrationWorkerDeps {
  readonly analysis: MigrationAnalysisDeps;
  readonly commit: MigrationCommitDeps;
  readonly purge: MigrationPurgeDeps;
  readonly fetch: MigrationFetchDeps;
}

/**
 * Drizzle repositories, S3 and the package reader for the migration tasks. The commit asks people with no consent date
 * to reconfirm through the same path as the import (consent secret, hash, queued system message).
 */
export function createMigrationWorkerDeps({ uow, files, queue, config, authSecret, connectors, onFetchError }: MigrationWorkerWiring): MigrationWorkerDeps {
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
    attachmentSniffer: sniffAttachment,
    consentTokens: r.consentTokens,
    mail: { conversations: r.conversations, messages: r.messages, config: config, newToken: newConversationToken },
    newSecret: newConsentSecret,
    hash: hashConsentSecret,
  };
  const registry = connectors ?? createConnectorRegistry();
  const fetch: MigrationFetchDeps = {
    ...analysis,
    sources: registry,
    secrets: createSecretBox(authSecret),
    fetcher: createMigrationFetcher({ registry, files, onError: onFetchError }),
  };
  return { analysis, commit, purge: analysis, fetch };
}
