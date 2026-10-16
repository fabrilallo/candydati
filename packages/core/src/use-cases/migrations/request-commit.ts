import { MIGRATION_ISSUES_PAGE_MAX, migrationCommitBlockers, type MigrationBatch, type MigrationCommitBlocker, type MigrationIssueCode } from '@candydati/domain';
import { z } from 'zod';
import type { PrivacyNoticeRepository } from '../../candidate-ports.js';
import { ConflictError, ValidationError } from '../../errors.js';
import type { MigrationDeps } from '../../migration-ports.js';
import { defineUseCase, type UseCase } from '../../use-case.js';
import { byMigrationId } from './queries.js';
import { assertMigrationStatus, requireMigration } from './shared.js';

export type MigrationCommitRequestDeps = MigrationDeps & { readonly privacyNotices: PrivacyNoticeRepository };

/** The three statements of the responsibility step (Task 4.2): each one must be ticked. */
const declarationsSchema = z.strictObject({ controller: z.literal(true), previewChecked: z.literal(true), processorsOwned: z.literal(true) });

const requestInput = byMigrationId.extend({ declarations: declarationsSchema }).strict();

/** Error codes of the stored analysis, page by page (there are few: the analysis records one per kind of problem). */
async function storedErrors(deps: MigrationDeps, batch: MigrationBatch): Promise<readonly MigrationIssueCode[]> {
  const codes: MigrationIssueCode[] = [];
  for (let page = 1; ; page += 1) {
    const { items, total } = await deps.migrationIssues.list({ organizationId: batch.organizationId, batchId: batch.id, page, limit: MIGRATION_ISSUES_PAGE_MAX, level: 'error' });
    codes.push(...items.map((issue) => issue.code));
    if (items.length === 0 || page * MIGRATION_ISSUES_PAGE_MAX >= total) return codes;
  }
}

const describeBlocker = (blocker: MigrationCommitBlocker): string => {
  if ('count' in blocker) return `${blocker.code}:${blocker.count}`;
  if ('jobRefs' in blocker) return `${blocker.code}:${blocker.jobRefs.join(',')}`;
  return blocker.code;
};

/**
 * The checks of the commit, as things stand now: the mapping from the stored choices (never from issue rows written
 * before the operator chose), the privacy notice looked up live (one published since the analysis counts), and every
 * other error-level finding of the analysis.
 */
async function assertCommittable(deps: MigrationCommitRequestDeps, batch: MigrationBatch): Promise<void> {
  const notice = await deps.privacyNotices.findActive(batch.organizationId);
  const stored = (await storedErrors(deps, batch)).filter((code) => code !== 'privacy_notice_missing');
  const errors = notice === null ? [...stored, 'privacy_notice_missing' as const] : stored;
  const blockers = migrationCommitBlockers({ stageMapping: batch.stageMapping, excludedJobs: batch.excludedJobs, errors });
  if (blockers.length > 0) throw new ValidationError(blockers.map((blocker) => ({ path: 'migration', message: describeBlocker(blocker) })));
}

/**
 * Task 3.4: an owner or admin confirms the preview with the three declarations of ADR 0009, decision 1. They are stored
 * on the batch with who and when, and recorded by the commit's audit event. The batch goes `ready → importing` by
 * compare-and-set (of two confirmations only one starts a commit) and `migration.commit` is queued with the batch as
 * singleton key. Refused with a code per reason: `stages_unmapped:<count>`, `too_many_stages:<jobs>`, or the code of an
 * error the choices cannot fix (`privacy_notice_missing`).
 */
export const requestMigrationCommit: UseCase<MigrationCommitRequestDeps, MigrationBatch> = defineUseCase({
  name: 'requestMigrationCommit',
  input: requestInput,
  permission: 'migration:manage',
  audit: { skip: 'the commit job records migration.committed with the counts and these declarations' },
  transaction: { skip: 'the compare-and-set commits before the task is queued, so the worker always finds the batch importing' },
  handler: async ({ deps, actor, input }): Promise<MigrationBatch> => {
    const batch = await requireMigration(deps, actor.organizationId, input.migrationId);
    assertMigrationStatus(batch, ['ready']);
    await assertCommittable(deps, batch);
    const now = deps.now();
    const declarations = { userId: actor.onBehalfOfUserId ?? actor.id ?? 'system', at: now.toISOString(), ...input.declarations };
    const saved = await deps.migrations.transition(batch.organizationId, batch.id, 'ready', { status: 'importing', declarations, error: null, updatedAt: now });
    try {
      await deps.queue.enqueue('migration.commit', { organizationId: batch.organizationId, batchId: batch.id }, { singletonKey: batch.id });
    } catch {
      await deps.migrations.transition(batch.organizationId, batch.id, 'importing', { status: 'ready', declarations: null }).catch(() => undefined);
      throw new ConflictError('queue_unavailable');
    }
    return saved;
  },
});
