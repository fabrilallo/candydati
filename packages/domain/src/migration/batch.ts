import { STAGE_TYPES, type StageType } from '../job/taxonomy.js';
import type { MigrationFetchCounts } from './connector.js';
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

/** Where the commit stands: the step it is in and the index of the next item of that step. Saved with each chunk. */
export const MIGRATION_COMMIT_STEPS = ['jobs', 'people', 'applications', 'reconfirm', 'notes', 'messages'] as const;
export type MigrationCommitStep = (typeof MIGRATION_COMMIT_STEPS)[number];

export interface MigrationCommitCursor {
  readonly step: MigrationCommitStep;
  readonly index: number;
}

/** What the commit wrote, added chunk by chunk in the same transaction as the rows. */
export interface MigrationCommitCounts {
  readonly cursor: MigrationCommitCursor;
  readonly jobs: number;
  readonly candidatesCreated: number;
  readonly candidatesMerged: number;
  readonly applications: number;
  /** A second open application of the same person to the same job: left out, like `already_applied` in the preview. */
  readonly skippedAlreadyApplied: number;
  readonly cvs: number;
  /** Files of migrated applications that were not stored, whatever the reason: the sum of the three below. */
  readonly filesSkipped: number;
  /**
   * Files stored as attachments (cover letters, other documents, a CV that is not a PDF or DOCX). Absent on batches
   * committed before attachments were kept: read as 0, like the counts below.
   */
  readonly attachments?: number;
  /** Skipped because the content is not an allowed type (an executable, an archive, HTML, SVG...). */
  readonly filesSkippedType?: number;
  /** Skipped because the file, or the application's attachments together, are over the size cap. */
  readonly filesSkippedSize?: number;
  /** Skipped because the package referenced a file it does not contain. */
  readonly filesSkippedMissing?: number;
  /** Applications whose form answers were kept. */
  readonly answers?: number;
  readonly stageEvents: number;
  readonly notes: number;
  readonly messages: number;
  readonly reconfirmationsQueued: number;
}

/** What the undo did. People kept are those who reconfirmed, or applied again, after the migration. */
export interface MigrationUndoCounts {
  readonly applicationsErased: number;
  readonly candidatesErased: number;
  readonly keptReconfirmed: number;
  readonly keptAppliedAgain: number;
  readonly jobsDeleted: number;
  /** Migrated jobs left in place: applications outside the batch (or of people kept), published, or referenced elsewhere. */
  readonly jobsKept: number;
  readonly historyDeleted: number;
  /** Candidates whose erasure failed: run the undo again. */
  readonly failed: number;
}

/** Totals of a batch: empty until the analysis fills them in; the commit and the undo add their own. */
export type MigrationCounts = Partial<MigrationAnalysisCounts> & {
  /** Set by a connector fetch: its progress, then how many parts it produced. */
  readonly fetch?: MigrationFetchCounts | undefined;
  readonly commit?: MigrationCommitCounts | undefined;
  readonly undo?: MigrationUndoCounts | undefined;
};

/** `other`: no stage type fits; the stage keeps its original title and the operator picks a type in the preview. */
export const MIGRATION_STAGE_OTHER = 'other';
/** `received`: the stage is where applications arrive (Applied, New, Sourced): they land in the job's first column. */
export const MIGRATION_STAGE_RECEIVED = 'received';
export const MIGRATION_STAGE_TARGETS = [...STAGE_TYPES, MIGRATION_STAGE_RECEIVED, MIGRATION_STAGE_OTHER] as const;
export type MigrationStageTarget = StageType | typeof MIGRATION_STAGE_RECEIVED | typeof MIGRATION_STAGE_OTHER;

/** Where one stage of one package job lands in Candydati. */
export interface MigrationStageMappingEntry {
  readonly jobRef: string;
  readonly stageRef: string;
  /** The stage name in the package, as it was: what the bulk choice matches (normalised). */
  readonly sourceName: string;
  readonly type: MigrationStageTarget;
  readonly title: string;
}
export type MigrationStageMapping = readonly MigrationStageMappingEntry[];

/** The three statements the operator confirms before the commit, with who and when (recorded in the audit log too). */
export interface MigrationDeclarations {
  readonly userId: string;
  readonly at: string;
  readonly controller: true;
  readonly previewChecked: true;
  /** Any AI agent or third-party tool that prepared the package is the organization's own processor, under its agreements. */
  readonly processorsOwned: true;
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
  /** When the package file and the issues were deleted, some days after the batch ended. */
  readonly purgedAt: Date | null;
  /**
   * Parts of one connector fetch: a source larger than one package (MIGRATION_LIMITS) is split into several packages,
   * one batch each, previewed and confirmed one by one. `groupId` is the id of part 1; both are null for an upload.
   */
  readonly groupId: string | null;
  readonly part: number | null;
}

/** Statuses after which nothing runs on the batch any more (except the undo of a `done` or `failed` one). */
export const MIGRATION_ENDED_STATUSES = ['done', 'failed', 'undone'] as const satisfies readonly MigrationStatus[];
export const isMigrationEnded = (status: MigrationStatus): boolean => (MIGRATION_ENDED_STATUSES as readonly MigrationStatus[]).includes(status);

/** Days after the end of a batch before its package and its issues are deleted. */
export const MIGRATION_PURGE_DAYS = 7;

export const MIGRATION_ISSUES_PAGE_MAX = 200;

export const migrationFilePrefix = (organizationId: string, batchId: string): string => `organizations/${organizationId}/migrations/${batchId}/`;
/** The files an operator uploads to a `files` connector, kept only while the fetch runs (like the credentials). */
export const MIGRATION_UPLOAD_NAMES = ['sheet', 'cvs'] as const;
export type MigrationUploadName = (typeof MIGRATION_UPLOAD_NAMES)[number];
export const migrationUploadKey = (organizationId: string, batchId: string, name: MigrationUploadName): string => `${migrationFilePrefix(organizationId, batchId)}upload/${name}`;
/** The spreadsheet is parsed in memory: same cap as an import sheet. */
export const MIGRATION_SHEET_MAX_BYTES = 25 * 1024 * 1024;

/** Where the uploaded (or fetched) package ZIP is stored. */
export const migrationPackageKey = (organizationId: string, batchId: string): string => `${migrationFilePrefix(organizationId, batchId)}package.zip`;
