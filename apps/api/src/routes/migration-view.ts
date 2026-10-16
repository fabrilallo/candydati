import type { MigrationBatch, MigrationBatchDto, MigrationCommitCounts, MigrationIssue, MigrationIssueDto } from '@candydati/domain';

export type MigrationBatchView = MigrationBatchDto;
export type MigrationIssueView = MigrationIssueDto;

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

const omitCursor = ({ cursor: _cursor, ...written }: MigrationCommitCounts): Omit<MigrationCommitCounts, 'cursor'> => written;

/**
 * The batch as the web shows it. Left out on purpose: where the package is stored, and the commit cursor (an internal
 * detail of the worker). The declarations keep their time, not the user id: the audit log has who.
 */
export function toMigrationView(batch: MigrationBatch): MigrationBatchView {
  const { commit, perJob, ...counts } = batch.counts;
  const written = commit === undefined ? undefined : omitCursor(commit);
  return {
    id: batch.id,
    status: batch.status,
    sourceSystem: batch.sourceSystem,
    producer: batch.producer,
    connectorMaturity: batch.connectorMaturity,
    counts: { ...counts, ...(perJob === undefined ? {} : { perJob: [...perJob] }), ...(written === undefined ? {} : { commit: written }) },
    stageMapping: [...batch.stageMapping],
    excludedJobs: [...batch.excludedJobs],
    declarations: batch.declarations === null ? null : { at: batch.declarations.at, controller: true, previewChecked: true, processorsOwned: true },
    error: batch.error,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    committedAt: iso(batch.committedAt),
    undoneAt: iso(batch.undoneAt),
    purgedAt: iso(batch.purgedAt),
  };
}

export const toIssueView = ({ id, level, code, ref, detail }: MigrationIssue): MigrationIssueView => ({ id, level, code, ref, detail });
