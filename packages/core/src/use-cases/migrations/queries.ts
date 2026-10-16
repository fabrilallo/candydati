import { MIGRATION_ISSUE_LEVELS, MIGRATION_ISSUES_PAGE_MAX, type MigrationBatch, type MigrationIssue } from '@candydati/domain';
import { z } from 'zod';
import { defineMigrationUseCase } from './define.js';
import { migrationIdSchema, requireMigration } from './shared.js';

export const DEFAULT_ISSUES_LIMIT = 50;

export interface MigrationIssuesView {
  readonly items: readonly MigrationIssue[];
  /** Issues matching the filter, across pages. */
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export const byMigrationId = z.object({ migrationId: migrationIdSchema });

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
  input: byMigrationId,
  permission: 'migration:manage',
  audit: { skip: 'preview: counts and package refs, the personal data is written, and audited, only by the commit' },
  handler: async ({ deps, actor, input }): Promise<MigrationBatch> => requireMigration(deps, actor.organizationId, input.migrationId),
});

/** One page of the analysis findings, errors first. */
export const listMigrationIssues = defineMigrationUseCase({
  name: 'listMigrationIssues',
  input: byMigrationId.extend({
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
