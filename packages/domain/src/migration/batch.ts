import type { StageType } from '../job/taxonomy.js';

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

/** Totals of a batch, by name (`jobs`, `candidates`, `applications`, `excluded`, ...): filled in by the analysis and the commit. */
export type MigrationCounts = Readonly<Record<string, number>>;

/** Where one stage of one package job lands in Candydati. */
export interface MigrationStageMappingEntry {
  readonly jobRef: string;
  readonly stageRef: string;
  readonly type: StageType;
  readonly title: string;
}
export type MigrationStageMapping = readonly MigrationStageMappingEntry[];

/** The three statements the operator confirms before the commit, with who and when (recorded in the audit log too). */
export interface MigrationDeclarations {
  readonly userId: string;
  readonly at: string;
  readonly controller: true;
  readonly previewChecked: true;
  readonly subProcessor: true;
}
