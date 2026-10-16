import {
  MIGRATION_ISSUE_LEVELS,
  MIGRATION_ISSUES_PAGE_MAX,
  migrationStageMappingEntrySchema,
  type MigrationBatch,
  type MigrationIssue,
  type MigrationStageMapping,
} from '@candydati/domain';
import { z } from 'zod';
import { ValidationError } from '../../errors.js';
import { defineMigrationUseCase } from './define.js';
import { assertMigrationStatus, migrationIdSchema, requireMigration } from './shared.js';

export const DEFAULT_ISSUES_LIMIT = 50;

export interface MigrationIssuesView {
  readonly items: readonly MigrationIssue[];
  /** Issues matching the filter, across pages. */
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

const byId = z.object({ migrationId: migrationIdSchema });

export const listMigrations = defineMigrationUseCase({
  name: 'listMigrations',
  input: z.object({}),
  permission: 'migration:manage',
  audit: { skip: 'listing of batches: counts only' },
  handler: async ({ deps, actor }): Promise<readonly MigrationBatch[]> => deps.migrations.list(actor.organizationId),
});

/** The batch with its counts, stage mapping and choices. Counts only: not audited. */
export const getMigration = defineMigrationUseCase({
  name: 'getMigration',
  input: byId,
  permission: 'migration:manage',
  audit: { skip: 'preview: counts and package refs, the personal data is written, and audited, only by the commit' },
  handler: async ({ deps, actor, input }): Promise<MigrationBatch> => requireMigration(deps, actor.organizationId, input.migrationId),
});

/** One page of the analysis findings, errors first. */
export const listMigrationIssues = defineMigrationUseCase({
  name: 'listMigrationIssues',
  input: byId.extend({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(MIGRATION_ISSUES_PAGE_MAX).default(DEFAULT_ISSUES_LIMIT),
    level: z.enum(MIGRATION_ISSUE_LEVELS).optional(),
  }),
  permission: 'migration:manage',
  audit: { skip: 'preview listing: package refs and codes, no personal data' },
  handler: async ({ deps, actor, input }): Promise<MigrationIssuesView> => {
    const batch = await requireMigration(deps, actor.organizationId, input.migrationId);
    const { items, total } = await deps.migrationIssues.list({ organizationId: batch.organizationId, batchId: batch.id, page: input.page, limit: input.limit, level: input.level });
    return { items, total, page: input.page, limit: input.limit };
  },
});

const choicesInput = byId
  .extend({
    /** Entries for stages of the package; the others keep what they had. */
    stageMapping: z.array(migrationStageMappingEntrySchema).max(10_000).optional(),
    /** Replaces the list of package jobs left out. */
    excludedJobs: z.array(z.string().min(1).max(120)).max(10_000).optional(),
    /** People whose retention expired never come across (ADR 0009, decision 2): only `false` is accepted. */
    includeExpired: z.literal(false).optional(),
  })
  .strict();

const stageKey = (entry: { readonly jobRef: string; readonly stageRef: string }): string => `${entry.jobRef}\u0000${entry.stageRef}`;

/** The proposed mapping with the operator's entries put in place; an entry for a stage the package does not have is refused. */
function mergeMapping(current: MigrationStageMapping, changes: MigrationStageMapping): MigrationStageMapping {
  const known = new Set(current.map(stageKey));
  const unknown = changes.filter((entry) => !known.has(stageKey(entry)));
  if (unknown.length > 0) throw new ValidationError(unknown.map((entry) => ({ path: 'stageMapping', message: `unknown_stage: ${entry.jobRef}/${entry.stageRef}` })));
  const byStage = new Map(changes.map((entry) => [stageKey(entry), entry] as const));
  return current.map((entry) => byStage.get(stageKey(entry)) ?? entry);
}

function checkJobs(batch: MigrationBatch, excludedJobs: readonly string[]): readonly string[] {
  const known = new Set((batch.counts.perJob ?? []).map((job) => job.jobRef));
  const unknown = excludedJobs.filter((ref) => !known.has(ref));
  if (unknown.length > 0) throw new ValidationError([{ path: 'excludedJobs', message: `unknown_job: ${unknown.join(', ')}` }]);
  return [...new Set(excludedJobs)];
}

/**
 * Task 3.3: the operator's choices in the preview: where each stage lands and which jobs stay behind. Only on a `ready`
 * batch, compare-and-set on that status, so a choice and the start of the commit never both win. People whose retention
 * expired stay out whatever is asked.
 */
export const updateMigrationChoices = defineMigrationUseCase({
  name: 'updateMigrationChoices',
  input: choicesInput,
  permission: 'migration:manage',
  audit: { skip: 'preview: nothing is written about candidates until the commit, which audits the choices it applies' },
  handler: async ({ deps, actor, input }): Promise<MigrationBatch> => {
    const batch = await requireMigration(deps, actor.organizationId, input.migrationId);
    assertMigrationStatus(batch, ['ready']);
    const stageMapping = input.stageMapping === undefined ? batch.stageMapping : mergeMapping(batch.stageMapping, input.stageMapping);
    const excludedJobs = input.excludedJobs === undefined ? batch.excludedJobs : checkJobs(batch, input.excludedJobs);
    return deps.migrations.transition(batch.organizationId, batch.id, 'ready', { stageMapping, excludedJobs, updatedAt: deps.now() });
  },
});
