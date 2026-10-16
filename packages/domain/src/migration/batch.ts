import { z } from 'zod';
import { STAGE_TITLE_MAX } from '../job/content.js';
import { STAGE_TYPES, type StageType } from '../job/taxonomy.js';
import type { MIGRATION_JOB_STATUSES } from './constants.js';

/**
 * Storage shapes of a migration from another ATS (ADR 0009). A batch goes `uploaded` (package) or `fetching`
 * (connector) → `analyzing` → `ready` (preview) → `importing` → `done`, and can end `failed` or `undone`.
 */
export const MIGRATION_STATUSES = ['uploaded', 'fetching', 'analyzing', 'ready', 'importing', 'done', 'failed', 'undone'] as const;
export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];

/** `package`: uploaded by hand (an agent skill, a script, a Candydati export), not produced by a built-in connector. */
export const CONNECTOR_MATURITIES = ['beta', 'stable', 'package'] as const;
export type ConnectorMaturity = (typeof CONNECTOR_MATURITIES)[number];

export const MIGRATION_ISSUE_LEVELS = ['error', 'warning', 'info'] as const;
export type MigrationIssueLevel = (typeof MIGRATION_ISSUE_LEVELS)[number];

/** Where a job comes from: written in the app, or created by a migration directly in its final state. */
export const JOB_ORIGINS = ['app', 'migration'] as const;
export type JobOrigin = (typeof JOB_ORIGINS)[number];

/** One job of the package in the preview: its applications of people who come across, by outcome. */
export interface MigrationJobCount {
  readonly jobRef: string;
  readonly title: string;
  readonly status: (typeof MIGRATION_JOB_STATUSES)[number];
  readonly stages: number;
  readonly applications: number;
  /** Still in progress: no outcome. */
  readonly open: number;
  readonly hired: number;
  readonly notSelected: number;
  readonly withdrawn: number;
}

/**
 * What the analysis found. Totals count what comes across (people whose retention expired are left out, with what hangs
 * from them in `excluded*`); a job the operator excludes is still listed in `perJob`, the preview subtracts it.
 */
export interface MigrationAnalysisCounts {
  readonly jobs: number;
  readonly candidates: number;
  readonly applications: number;
  readonly notes: number;
  readonly messages: number;
  readonly files: number;
  /** People whose email already belongs to a candidate of the organization: merged, never overwritten. */
  readonly merged: number;
  readonly consentGiven: number;
  readonly consentToRenew: number;
  readonly consentExpired: number;
  readonly excludedApplications: number;
  readonly excludedNotes: number;
  readonly excludedMessages: number;
  readonly excludedFiles: number;
  readonly issueErrors: number;
  readonly issueWarnings: number;
  readonly issueInfos: number;
  readonly perJob: readonly MigrationJobCount[];
}

/** Totals of a batch: empty until the analysis fills them in; the commit adds its own. */
export type MigrationCounts = Partial<MigrationAnalysisCounts>;

/** `other`: no stage type fits; the stage keeps its original title and the operator picks a type in the preview. */
export const MIGRATION_STAGE_OTHER = 'other';
export const MIGRATION_STAGE_TARGETS = [...STAGE_TYPES, MIGRATION_STAGE_OTHER] as const;
export type MigrationStageTarget = StageType | typeof MIGRATION_STAGE_OTHER;

/** Where one stage of one package job lands in Candydati. */
export interface MigrationStageMappingEntry {
  readonly jobRef: string;
  readonly stageRef: string;
  readonly type: MigrationStageTarget;
  readonly title: string;
}
export type MigrationStageMapping = readonly MigrationStageMappingEntry[];

export const migrationStageMappingEntrySchema = z.strictObject({
  jobRef: z.string().min(1).max(120),
  stageRef: z.string().min(1).max(120),
  type: z.enum(MIGRATION_STAGE_TARGETS),
  title: z.string().trim().min(1).max(STAGE_TITLE_MAX),
});

/** The three statements the operator confirms before the commit, with who and when (recorded in the audit log too). */
export interface MigrationDeclarations {
  readonly userId: string;
  readonly at: string;
  readonly controller: true;
  readonly previewChecked: true;
  readonly subProcessor: true;
}

/**
 * Findings of the analysis. `error` blocks the commit; `warning` is something left out or worth a look; `info` is what
 * will happen (a merge, a reconfirmation, a stage to name).
 */
export const MIGRATION_ISSUE_CODES = [
  'privacy_notice_missing',
  'consent_expired',
  'consent_to_renew',
  'merge_existing',
  'no_email',
  'duplicate_email',
  'already_applied',
  'stage_unmapped',
  'too_many_stages',
  'file_missing',
  'file_too_large',
  'file_not_cv',
  'file_unreferenced',
] as const;
export type MigrationIssueCode = (typeof MIGRATION_ISSUE_CODES)[number];

/** A finding before it is stored. `ref` is the package ref it is about (candidate, application, `job/stage`, file path). */
export interface MigrationIssueDraft {
  readonly level: MigrationIssueLevel;
  readonly code: MigrationIssueCode;
  readonly ref: string | null;
  /** Never personal data: a date, a size, a stage name, a count. */
  readonly detail: string | null;
}

export interface MigrationIssue extends MigrationIssueDraft {
  readonly id: string;
  readonly organizationId: string;
  readonly batchId: string;
}

/** A migration batch. The connector credentials live in their own column and never travel with it. */
export interface MigrationBatch {
  readonly id: string;
  readonly organizationId: string;
  readonly status: MigrationStatus;
  /** As the package says; empty until the analysis has read it. Free text, never trusted for logic. */
  readonly sourceSystem: string;
  readonly producer: string;
  readonly connectorMaturity: ConnectorMaturity;
  readonly createdBy: string;
  readonly counts: MigrationCounts;
  readonly stageMapping: MigrationStageMapping;
  readonly excludedJobs: readonly string[];
  readonly declarations: MigrationDeclarations | null;
  readonly packageKey: string;
  /** A short reason code, safe to show. */
  readonly error: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly committedAt: Date | null;
  readonly undoneAt: Date | null;
}

export const MIGRATION_ISSUES_PAGE_MAX = 200;

export const migrationFilePrefix = (organizationId: string, batchId: string): string => `organizations/${organizationId}/migrations/${batchId}/`;
/** Where the uploaded (or fetched) package ZIP is stored. */
export const migrationPackageKey = (organizationId: string, batchId: string): string => `${migrationFilePrefix(organizationId, batchId)}package.zip`;
