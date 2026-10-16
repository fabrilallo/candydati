import type { MigrationBatch } from '@candydati/domain';
import { z } from 'zod';
import type { MigrationCommitDeps } from '../../migration-commit-ports.js';
import { inTransaction } from '../../transaction.js';
import { defineSystemJob } from '../../use-case.js';
import { buildCommitContext } from './commit-context.js';
import { commitCountsOf, runCommitSteps } from './commit-runner.js';
import { COMMIT_STEPS } from './commit-writers.js';

const SYSTEM_ACTOR = { type: 'system', id: null, onBehalfOfUserId: null } as const;

const commitInput = z.object({
  organizationId: z.string().min(1),
  batchId: z.string().min(1),
  /** True when the queue will not retry: an unexpected error then fails the batch instead of being retried. */
  lastAttempt: z.boolean().default(false),
});

export type MigrationCommitOutcome = 'done' | 'failed' | 'skipped';

/** `migration.committed`: counts, source, producer, maturity and the operator's declarations (ADR 0009, decision 1). */
const auditMetadata = (batch: MigrationBatch, status: 'done' | 'failed') => ({
  status,
  ...(batch.error === null ? {} : { error: batch.error }),
  counts: commitCountsOf(batch),
  sourceSystem: batch.sourceSystem,
  producer: batch.producer,
  connectorMaturity: batch.connectorMaturity,
  declarations: batch.declarations,
  excludedJobs: batch.excludedJobs.length,
});

/** The end of the commit, `done` or `failed`, with its audit event, in one transaction; nothing when another run ended it. */
async function end(deps: MigrationCommitDeps, batch: MigrationBatch, error: string | null): Promise<MigrationBatch | null> {
  return inTransaction(deps, async (tx) => {
    const locked = await tx.migrations.lock(batch.organizationId, batch.id);
    if (!locked || locked.status !== 'importing') return null;
    const now = deps.now();
    const status = error === null ? 'done' : 'failed';
    const ended = await tx.migrations.transition(batch.organizationId, batch.id, 'importing', {
      status,
      error,
      updatedAt: now,
      ...(error === null ? { committedAt: now } : {}),
    });
    await tx.auditLog.append({
      organizationId: batch.organizationId,
      actor: SYSTEM_ACTOR,
      action: 'migration.committed',
      target: { type: 'migration_batch', id: batch.id },
      metadata: auditMetadata(ended, status),
    });
    return ended;
  });
}

/**
 * Task 3.4, worker of `migration.commit`. Writes a confirmed migration in this order, one transaction per chunk: jobs
 * (closed or draft, `origin 'migration'`, merged stages), people (new, or merged by email without touching the existing
 * profile), applications (stage, outcome, original dates, consent carried over, CV copied, backfilled stage history, CV
 * extraction queued), reconfirmation requests for people with no consent date, notes, historical messages. Excluded
 * jobs and people whose retention expired are not written; every row carries the batch id.
 *
 * Resumable and idempotent: each chunk commits together with the cursor (step and index) and the counts on the batch,
 * so a retry after a crash starts after the last chunk that committed and writes nothing twice; every row has a stable
 * id derived from the batch and its package ref, so a CV copied before a crash is overwritten, never duplicated. A
 * package that can never commit fails the batch at once with a code; any other error is retried by the queue and fails
 * the batch (`commit_failed`) on the last attempt. Either end records `migration.committed`.
 */
export const commitMigration = defineSystemJob<MigrationCommitDeps, typeof commitInput, MigrationCommitOutcome>({
  name: 'commitMigration',
  input: commitInput,
  handler: async ({ deps, input }) => {
    const batch = await deps.migrations.findById(input.organizationId, input.batchId);
    if (!batch || batch.status !== 'importing') return 'skipped';
    try {
      const ctx = await buildCommitContext(deps, batch);
      if ('failure' in ctx) return (await end(deps, batch, ctx.failure)) === null ? 'skipped' : 'failed';
      if (!(await runCommitSteps(ctx, COMMIT_STEPS))) return 'skipped';
      return (await end(deps, batch, null)) === null ? 'skipped' : 'done';
    } catch (error) {
      if (!input.lastAttempt) throw error;
      return (await end(deps, batch, 'commit_failed')) === null ? 'skipped' : 'failed';
    }
  },
});
