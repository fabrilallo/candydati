import type { MigrationBatch, MigrationFetchCounts } from '@candydati/domain';
import type { MigrationFetchDeps, MigrationFetchResult, MigrationPartCounts } from '../../migration-fetch-ports.js';
import { inTransaction } from '../../transaction.js';

const SYSTEM_ACTOR = { type: 'system', id: null, onBehalfOfUserId: null } as const;

const COUNT_KEYS = ['jobs', 'candidates', 'applications', 'notes', 'messages', 'files', 'bytes'] as const;

const totalsOf = (parts: MigrationFetchResult['parts']): MigrationPartCounts =>
  Object.fromEntries(COUNT_KEYS.map((key) => [key, parts.reduce((sum, part) => sum + part.counts[key], 0)])) as unknown as MigrationPartCounts;

/** A later part: the same migration as part 1 (owner, connector, maturity), its own package. */
const laterPart = (lead: MigrationBatch, id: string, packageKey: string, part: number, now: Date): MigrationBatch => ({
  ...lead,
  id,
  packageKey,
  part,
  groupId: lead.id,
  createdAt: now,
  updatedAt: now,
});

/**
 * The parts of a finished fetch, in one transaction: part 1 is the batch that fetched (now `uploaded`), each later part
 * a new batch of the same group, and the `migration.fetched` audit event with the totals (no personal data). Then each
 * part's analysis is queued; a part that cannot be queued is failed so the operator sees it.
 */
export async function registerFetchedParts(
  deps: MigrationFetchDeps,
  batch: MigrationBatch,
  result: MigrationFetchResult,
  idOfKey: ReadonlyMap<string, string>,
  progress: MigrationFetchCounts,
): Promise<readonly MigrationBatch[]> {
  const now = deps.now();
  const fetch: MigrationFetchCounts = { done: progress.done, total: progress.total, parts: result.parts.length };
  const parts = await inTransaction(deps, async (tx) => {
    const lead = await tx.migrations.transition(batch.organizationId, batch.id, 'fetching', { status: 'uploaded', counts: { fetch }, groupId: batch.id, part: 1, error: null, updatedAt: now });
    const later: MigrationBatch[] = [];
    for (const [index, part] of result.parts.entries()) {
      if (index === 0) continue;
      later.push(await tx.migrations.create(laterPart(lead, idOfKey.get(part.key) ?? '', part.key, index + 1, now)));
    }
    await tx.auditLog.append({
      organizationId: batch.organizationId,
      actor: SYSTEM_ACTOR,
      action: 'migration.fetched',
      target: { type: 'migration_batch', id: batch.id },
      metadata: { connectorId: batch.sourceSystem, parts: result.parts.length, ...totalsOf(result.parts) },
    });
    return [lead, ...later];
  });
  const queued: MigrationBatch[] = [];
  for (const part of parts) queued.push(await queueAnalysis(deps, part));
  return queued;
}

async function queueAnalysis(deps: MigrationFetchDeps, part: MigrationBatch): Promise<MigrationBatch> {
  try {
    await deps.queue.enqueue('migration.analyze', { organizationId: part.organizationId, batchId: part.id }, { singletonKey: part.id });
    return part;
  } catch {
    return deps.migrations.transition(part.organizationId, part.id, 'uploaded', { status: 'failed', error: 'queue_unavailable', updatedAt: deps.now() });
  }
}
