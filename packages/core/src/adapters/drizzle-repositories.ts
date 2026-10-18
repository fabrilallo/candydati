import type { BindableTaskQueue } from '../intake-ports.js';
import type { TransactionPort, TransactionScope } from '../transaction.js';
import type { DbExecutor } from './db-executor.js';
import { createDrizzleApiKeys, createDrizzleMemberRoles } from './drizzle-api-keys.js';
import { createDrizzleTwoFactor } from './drizzle-two-factor.js';
import { createDrizzleApplicationCounts } from './drizzle-application-counts.js';
import { createDrizzleApplicationIntake } from './drizzle-application-intake.js';
import { createDrizzleApplications } from './drizzle-applications.js';
import { createDrizzleAuditLog } from './drizzle-audit-log.js';
import { createDrizzleAutomationExecutions, createDrizzleAutomationRules } from './drizzle-automation-rules.js';
import { createDrizzleCandidateNotes } from './drizzle-candidate-notes.js';
import { createDrizzleCandidateSearch } from './drizzle-candidate-search.js';
import { createDrizzleCandidates } from './drizzle-candidates.js';
import { createDrizzleConversations } from './drizzle-conversations.js';
import { createDrizzleCvExtractions } from './drizzle-cv-extractions.js';
import { createDrizzleDistributionSettings, createDrizzleJobDistributions } from './drizzle-distribution.js';
import { createDrizzleEmailSettings } from './drizzle-email-settings.js';
import { createDrizzleEmailTemplates } from './drizzle-email-templates.js';
import { createDrizzleErasure } from './drizzle-erasure.js';
import { createDrizzleFeedbackRequests, createDrizzleInterviewFeedback, createDrizzleStageInterviewers } from './drizzle-feedback.js';
import { createDrizzleImportCommit } from './drizzle-import-commit.js';
import { createDrizzleConsentTokens, createDrizzleImportAnalyses, createDrizzleImportBatches, createDrizzleImportItems } from './drizzle-imports.js';
import { createDrizzleJobApprovals, createDrizzleJobRequests, createDrizzleOrganizationSettings, createDrizzleStaleJobs } from './drizzle-job-requests.js';
import { createDrizzleJobTemplates } from './drizzle-job-templates.js';
import { createDrizzleJobs } from './drizzle-jobs.js';
import { createDrizzleMigrationBatches, createDrizzleMigrationIssues } from './drizzle-migrations.js';
import { createDrizzleMigratedRows } from './drizzle-migrated-rows.js';
import { createDrizzleJobTeams } from './drizzle-job-teams.js';
import { createDrizzleMemberDirectory } from './drizzle-members.js';
import { createDrizzleMessages } from './drizzle-messages.js';
import { createDrizzleNotifications } from './drizzle-notifications.js';
import { createDrizzleOrganizationLogos } from './drizzle-organization-logos.js';
import { createDrizzleOrganizationDirectory } from './drizzle-organizations.js';
import { createDrizzleOutbox } from './drizzle-outbox.js';
import { createDrizzleDataExports, createDrizzleRetentionRuns } from './drizzle-privacy.js';
import { createDrizzlePrivacyNotices } from './drizzle-privacy-notices.js';
import { createDrizzleResponsePromises, createDrizzleStageEvents } from './drizzle-report-history.js';
import { createDrizzleJobViews } from './drizzle-job-views.js';
import { createDrizzleReports } from './drizzle-reports.js';
import { createDrizzleTasks } from './drizzle-tasks.js';
import { createDrizzleUserDirectory } from './drizzle-user-directory.js';
import { createDrizzleWebhookDeliveries, createDrizzleWebhookEndpoints } from './drizzle-webhooks.js';
import { toSqlExecutor } from './sql-executor.js';
import { createDrizzleStuckWork } from './drizzle-stuck-work.js';
import { createDrizzleSecuritySettings } from './drizzle-security-settings.js';
import { createDrizzleCareersMedia, createDrizzleCareersPages } from './drizzle-careers.js';

/** Jobs, organizations, approvals, automation and webhooks. */
const jobRepositories = (db: DbExecutor) => {
  const automationRules = createDrizzleAutomationRules(db);
  return {
    auditLog: createDrizzleAuditLog(db),
    jobs: createDrizzleJobs(db),
    jobTeams: createDrizzleJobTeams(db),
    jobTemplates: createDrizzleJobTemplates(db),
    applicationCounts: createDrizzleApplicationCounts(db),
    organizations: createDrizzleOrganizationDirectory(db),
    privacyNotices: createDrizzlePrivacyNotices(db),
    automationRules,
    rules: automationRules,
    executions: createDrizzleAutomationExecutions(db),
    outbox: createDrizzleOutbox(db),
    approvals: createDrizzleJobApprovals(db),
    organizationSettings: createDrizzleOrganizationSettings(db),
    securitySettings: createDrizzleSecuritySettings(db),
    jobRequests: createDrizzleJobRequests(db),
    staleJobs: createDrizzleStaleJobs(db),
    endpoints: createDrizzleWebhookEndpoints(db),
    deliveries: createDrizzleWebhookDeliveries(db),
    distributions: createDrizzleJobDistributions(db),
    distributionSettings: createDrizzleDistributionSettings(db),
    apiKeys: createDrizzleApiKeys(db),
    memberRoles: createDrizzleMemberRoles(db),
    twoFactor: createDrizzleTwoFactor(db),
    reports: createDrizzleReports(db),
    jobViews: createDrizzleJobViews(db),
    careersPages: createDrizzleCareersPages(db),
    careersMedia: createDrizzleCareersMedia(db),
    organizationLogos: createDrizzleOrganizationLogos(db),
  } as const;
};

/** Candidates, applications and everything written about them: messages, feedback, tasks, history. */
const candidateRepositories = (db: DbExecutor) =>
  ({
    candidates: createDrizzleCandidates(db),
    applications: createDrizzleApplications(db),
    notes: createDrizzleCandidateNotes(db),
    extractions: createDrizzleCvExtractions(db),
    candidateSearch: createDrizzleCandidateSearch(db),
    users: createDrizzleUserDirectory(db),
    members: createDrizzleMemberDirectory(db),
    messages: createDrizzleMessages(db),
    conversations: createDrizzleConversations(db),
    templates: createDrizzleEmailTemplates(db),
    settings: createDrizzleEmailSettings(db),
    stageEvents: createDrizzleStageEvents(db),
    promises: createDrizzleResponsePromises(db),
    intake: createDrizzleApplicationIntake(db),
    feedbackRequests: createDrizzleFeedbackRequests(db),
    interviewFeedback: createDrizzleInterviewFeedback(db),
    stageInterviewers: createDrizzleStageInterviewers(db),
    notifications: createDrizzleNotifications(db),
    tasks: createDrizzleTasks(db),
  }) as const;

/** Privacy operations, imports and migrations. */
const operationRepositories = (db: DbExecutor) =>
  ({
    erasure: createDrizzleErasure(db),
    retentionRuns: createDrizzleRetentionRuns(db),
    dataExports: createDrizzleDataExports(db),
    imports: createDrizzleImportBatches(db),
    importItems: createDrizzleImportItems(db),
    importAnalyses: createDrizzleImportAnalyses(db),
    consentTokens: createDrizzleConsentTokens(db),
    commit: createDrizzleImportCommit(db),
    migrations: createDrizzleMigrationBatches(db),
    migrationIssues: createDrizzleMigrationIssues(db),
    migratedRows: createDrizzleMigratedRows(db),
    stuck: createDrizzleStuckWork(db),
  }) as const;

/**
 * Every Postgres repository, built once on one executor and named like the dependency keys of the use cases. On the
 * pool it is the composition root of the api and the worker; on a transaction it is what the unit of work swaps in.
 */
export const createDrizzleRepositories = (db: DbExecutor) => ({ ...jobRepositories(db), ...candidateRepositories(db), ...operationRepositories(db) });

export type DrizzleRepositories = ReturnType<typeof createDrizzleRepositories>;

/** What the api and the worker are built from: the repositories on the pool, and the unit of work that rebinds them. */
export interface DrizzleUnitOfWork {
  readonly repositories: DrizzleRepositories;
  readonly transaction: TransactionPort;
}

/** A savepoint on the transaction's connection: Drizzle's nested transaction (`SAVEPOINT` / `ROLLBACK TO SAVEPOINT`). */
const scopeOf = (tx: DbExecutor): TransactionScope => ({ savepoint: (work) => tx.transaction(() => work()) });

/**
 * The unit of work on Postgres: `db.transaction`, with every repository of `repositories` swapped for the same one
 * rebuilt on the transaction. Adapters that open their own transaction (intake, erasure, import chunk) get a savepoint.
 * With `queue` (pg-boss), the queue is swapped too, for one sending on the transaction's connection: a task is
 * inserted together with the rows it is about, so it exists if and only if they committed.
 */
export function createDrizzleUnitOfWork(db: DbExecutor, onEffectError?: (error: unknown) => void, queue?: BindableTaskQueue): DrizzleUnitOfWork {
  const repositories = createDrizzleRepositories(db);
  const names = Object.keys(repositories) as (keyof DrizzleRepositories)[];
  const transaction: TransactionPort = {
    onEffectError,
    run: (work) =>
      db.transaction((tx) => {
        const bound = createDrizzleRepositories(tx);
        const swapped = new Map<unknown, unknown>(names.map((name) => [repositories[name], bound[name]]));
        if (queue) swapped.set(queue, queue.bindTo(toSqlExecutor(tx)));
        return work(swapped, scopeOf(tx));
      }),
  };
  return { repositories, transaction };
}

/** A unit of work for deps that carry their own repositories: it opens the transaction but rebinds nothing of theirs. */
export const createDrizzleTransaction = (db: DbExecutor, onEffectError?: (error: unknown) => void): TransactionPort =>
  createDrizzleUnitOfWork(db, onEffectError).transaction;
