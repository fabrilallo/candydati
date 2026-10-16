import type { MigrationBatch, MigrationBatchDto, MigrationFetchCounts, MigrationCommitCounts, MigrationIssue, MigrationIssueDto } from '@candydati/domain';

export type MigrationBatchView = MigrationBatchDto;
export type MigrationIssueView = MigrationIssueDto;

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

const omitCursor = ({ cursor: _cursor, ...written }: MigrationCommitCounts): Omit<MigrationCommitCounts, 'cursor'> => written;

/**
 * The batch as the web shows it. Left out on purpose: where the package is stored, and the commit cursor (an internal
 * detail of the worker). The declarations keep their time, not the user id: the audit log has who.
 */
/** A connector fetch's progress and parts; the temporary file slots it reserved stay internal. */
const fetchView = (fetch: MigrationFetchCounts): NonNullable<MigrationBatchView['counts']['fetch']> => ({
  done: fetch.done,
  total: fetch.total,
  ...(fetch.parts === undefined ? {} : { parts: fetch.parts }),
});

export function toMigrationView(batch: MigrationBatch): MigrationBatchView {
  const { commit, perJob, fetch, ...counts } = batch.counts;
  const written = commit === undefined ? undefined : omitCursor(commit);
  return {
    id: batch.id,
    status: batch.status,
    sourceSystem: batch.sourceSystem,
    producer: batch.producer,
    connectorMaturity: batch.connectorMaturity,
    counts: {
      ...counts,
      ...(perJob === undefined ? {} : { perJob: [...perJob] }),
      ...(fetch === undefined ? {} : { fetch: fetchView(fetch) }),
      ...(written === undefined ? {} : { commit: written }),
    },
    stageMapping: [...batch.stageMapping],
    excludedJobs: [...batch.excludedJobs],
    declarations: batch.declarations === null ? null : { at: batch.declarations.at, controller: true, previewChecked: true, processorsOwned: true },
    error: batch.error,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    committedAt: iso(batch.committedAt),
    undoneAt: iso(batch.undoneAt),
    purgedAt: iso(batch.purgedAt),
    groupId: batch.groupId,
    part: batch.part,
  };
}

export const toIssueView = ({ id, level, code, ref, detail }: MigrationIssue): MigrationIssueView => ({ id, level, code, ref, detail });
