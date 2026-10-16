import type { Application, MigrationBatch, MigrationUndoCounts } from '@candydati/domain';
import { toAuditActor, type Actor } from '../../actor.js';
import type { MigrationUndoDeps } from '../../migration-commit-ports.js';
import { defineUseCase, type UseCase } from '../../use-case.js';
import { eraseCandidateData, FileCleanupError } from '../privacy/erase-candidate-data.js';
import { byMigrationId } from './queries.js';
import { assertMigrationStatus, requireMigration } from './shared.js';

export interface UndoMigrationResult {
  readonly batch: MigrationBatch;
  readonly counts: MigrationUndoCounts;
}

type Verdict = 'erase' | 'reconfirmed' | 'applied_again';

/**
 * Whose data stays: a person who reconfirmed a migrated application (its consent is no longer the migrated one) or who
 * applied again after the migration (an application outside the batch, created after the operator confirmed). Their
 * data is theirs now: the undo leaves the person, and what the batch brought them, as it is.
 */
function verdictOf(batch: MigrationBatch, applications: readonly Application[]): Verdict {
  const own = applications.filter((a) => a.migrationBatchId === batch.id);
  if (own.some((a) => a.consentStatus === 'given' && a.consent.origin !== 'migration')) return 'reconfirmed';
  const since = batch.declarations === null ? batch.createdAt : new Date(batch.declarations.at);
  if (applications.some((a) => a.migrationBatchId !== batch.id && a.createdAt >= since)) return 'applied_again';
  return 'erase';
}

interface PeopleOutcome {
  /** People whose history stays: those kept, and those whose erasure failed (the next undo deals with them). */
  readonly remaining: readonly string[];
  readonly counts: Pick<MigrationUndoCounts, 'applicationsErased' | 'candidatesErased' | 'keptReconfirmed' | 'keptAppliedAgain' | 'failed'>;
}

/** Each person in their own erasure (`eraseCandidateData`, reason `migration_undone`): a failure leaves the others done. */
async function undoPeople(deps: MigrationUndoDeps, actor: Actor, batch: MigrationBatch): Promise<PeopleOutcome> {
  const remaining: string[] = [];
  const tally = { applicationsErased: 0, candidatesErased: 0, keptReconfirmed: 0, keptAppliedAgain: 0, failed: 0 };
  for (const candidateId of await deps.migratedRows.candidateIdsOf(batch.organizationId, batch.id)) {
    const applications = await deps.applications.listByCandidate(batch.organizationId, candidateId);
    const verdict = verdictOf(batch, applications);
    if (verdict !== 'erase') {
      remaining.push(candidateId);
      if (verdict === 'reconfirmed') tally.keptReconfirmed += 1;
      else tally.keptAppliedAgain += 1;
      continue;
    }
    const applicationIds = applications.filter((a) => a.migrationBatchId === batch.id).map((a) => a.id);
    try {
      const result = await eraseCandidateData(deps, { organizationId: batch.organizationId, candidateId, applicationIds, reason: 'migration_undone', actor: toAuditActor(actor) });
      tally.applicationsErased += result.applicationCount;
      if (result.candidateErased) tally.candidatesErased += 1;
    } catch (error) {
      // The erasure committed; only stored files are left over (queued for deletion or reported). It is done.
      if (error instanceof FileCleanupError) tally.applicationsErased += error.result.applicationCount;
      else {
        tally.failed += 1;
        remaining.push(candidateId);
      }
    }
  }
  return { remaining, counts: tally };
}

/** Migrated jobs go when nothing refers to them any more; the others stay (applications outside the batch, published...). */
async function undoJobs(deps: MigrationUndoDeps, batch: MigrationBatch): Promise<Pick<MigrationUndoCounts, 'jobsDeleted' | 'jobsKept'>> {
  let deleted = 0;
  const jobIds = await deps.migratedRows.jobIdsOf(batch.organizationId, batch.id);
  for (const jobId of jobIds) if (await deps.migratedRows.deleteJobIfUnused(batch.organizationId, batch.id, jobId)) deleted += 1;
  return { jobsDeleted: deleted, jobsKept: jobIds.length - deleted };
}

/**
 * Task 3.5: undoes a whole migration that is `done` (or `failed` after part of it was written). Every person the batch
 * touched is erased through `eraseCandidateData` (reason `migration_undone`, one `candidate.erased` each): a candidate the
 * batch created goes entirely, someone who already existed loses only what the batch added. People who reconfirmed, or
 * applied again after the migration, are kept and counted. Then the notes, historical messages and stage events of the
 * batch about anyone not kept go, and the migrated jobs nothing refers to any more. The batch row stays, `undone`, with
 * its counts; while an erasure failed it stays as it was and the undo can be run again.
 */
export const undoMigration: UseCase<MigrationUndoDeps, UndoMigrationResult> = defineUseCase({
  name: 'undoMigration',
  input: byMigrationId,
  permission: 'migration:manage',
  audit: {
    action: 'migration.undone',
    target: (input) => ({ type: 'migration_batch', id: input.migrationId }),
    metadata: (_input, result: UndoMigrationResult) => ({ ...result.counts, status: result.batch.status }),
  },
  transaction: { skip: 'each erasure commits on its own: a long undo keeps what it did and can be run again' },
  handler: async ({ deps, actor, input }): Promise<UndoMigrationResult> => {
    const batch = await requireMigration(deps, actor.organizationId, input.migrationId);
    assertMigrationStatus(batch, ['done', 'failed']);
    const people = await undoPeople(deps, actor, batch);
    const historyDeleted = await deps.migratedRows.deleteHistory(batch.organizationId, batch.id, people.remaining);
    const jobs = people.counts.failed === 0 ? await undoJobs(deps, batch) : { jobsDeleted: 0, jobsKept: 0 };
    const counts: MigrationUndoCounts = { ...people.counts, ...jobs, historyDeleted };
    const now = deps.now();
    const patch = people.counts.failed === 0 ? { status: 'undone' as const, undoneAt: now } : {};
    const saved = await deps.migrations.transition(batch.organizationId, batch.id, batch.status, { ...patch, counts: { ...batch.counts, undo: counts }, updatedAt: now });
    return { batch: saved, counts };
  },
});
