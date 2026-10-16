import {
  MIGRATION_COMMIT_STEPS,
  type MigrationBatch,
  type MigrationCommitCounts,
  type MigrationCommitCursor,
  type MigrationCommitStep,
  type StoredFile,
} from '@candydati/domain';
import type { MigrationCommitDeps } from '../../migration-commit-ports.js';
import { inTransaction } from '../../transaction.js';
import type { MigrationCommitContext } from './commit-context.js';

/** What one chunk adds to the batch's commit counts. */
export type CommitDelta = Partial<Omit<MigrationCommitCounts, 'cursor'>>;

/** CVs copied to their final keys before a chunk of applications, by application ref, and the files left behind. */
export interface PreparedFiles {
  readonly cvs: ReadonlyMap<string, StoredFile>;
  readonly skipped: number;
}

export const NO_FILES: PreparedFiles = { cvs: new Map(), skipped: 0 };

/** One step of the commit: how many items it has, how many go in one transaction, and how a chunk is written. */
export interface CommitStepWriter {
  readonly size: number;
  /** Items of the step in this run's plan. */
  length(ctx: MigrationCommitContext): number;
  /** Outside the transaction (storage is not transactional): copy what the chunk's rows will point to. */
  prepare?(ctx: MigrationCommitContext, from: number, to: number): Promise<PreparedFiles>;
  /** Inside the chunk's transaction, with `tx` bound to it. */
  write(ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number, prepared: PreparedFiles): Promise<CommitDelta>;
  /** After a failed transaction: remove what `prepare` stored. */
  discard?(ctx: MigrationCommitContext, prepared: PreparedFiles): Promise<void>;
}

export type CommitSteps = Readonly<Record<MigrationCommitStep, CommitStepWriter>>;

export const emptyCommitCounts = (): MigrationCommitCounts => ({
  cursor: { step: MIGRATION_COMMIT_STEPS[0], index: 0 },
  jobs: 0,
  candidatesCreated: 0,
  candidatesMerged: 0,
  applications: 0,
  skippedAlreadyApplied: 0,
  cvs: 0,
  filesSkipped: 0,
  stageEvents: 0,
  notes: 0,
  messages: 0,
  reconfirmationsQueued: 0,
});

export const commitCountsOf = (batch: MigrationBatch): MigrationCommitCounts => batch.counts.commit ?? emptyCommitCounts();

/** The cursor moved past finished steps; null once every step is done. */
export function nextCursor(cursor: MigrationCommitCursor, ctx: MigrationCommitContext, steps: CommitSteps): MigrationCommitCursor | null {
  for (let position = MIGRATION_COMMIT_STEPS.indexOf(cursor.step); position < MIGRATION_COMMIT_STEPS.length; position += 1) {
    const step = MIGRATION_COMMIT_STEPS[position];
    if (step === undefined) return null;
    const index = step === cursor.step ? cursor.index : 0;
    if (index < steps[step].length(ctx)) return { step, index };
  }
  return null;
}

const added = (counts: MigrationCommitCounts, delta: CommitDelta, cursor: MigrationCommitCursor): MigrationCommitCounts => {
  const sum = Object.fromEntries(Object.entries(delta).map(([key, value]) => [key, (counts[key as keyof CommitDelta] ?? 0) + (value ?? 0)]));
  return { ...counts, ...sum, cursor };
};

const sameCursor = (a: MigrationCommitCursor | null, b: MigrationCommitCursor): boolean => a !== null && a.step === b.step && a.index === b.index;

type ChunkOutcome = 'written' | 'raced' | 'stopped';

/**
 * One chunk in ONE transaction with its counts and the cursor after it: a crash leaves either all of it or none of it,
 * and the next run starts right after the last chunk that committed. The batch row is locked first: a second run of
 * the commit (a redelivered task) waits, then finds the cursor moved and writes nothing of this chunk.
 */
async function writeChunk(ctx: MigrationCommitContext, steps: CommitSteps, cursor: MigrationCommitCursor): Promise<ChunkOutcome> {
  const { deps, batch } = ctx;
  const writer = steps[cursor.step];
  const end = Math.min(cursor.index + writer.size, writer.length(ctx));
  const prepared = writer.prepare ? await writer.prepare(ctx, cursor.index, end) : NO_FILES;
  try {
    return await inTransaction(deps, async (tx): Promise<ChunkOutcome> => {
      const locked = await tx.migrations.lock(batch.organizationId, batch.id);
      if (!locked || locked.status !== 'importing') return 'stopped';
      const counts = commitCountsOf(locked);
      if (!sameCursor(nextCursor(counts.cursor, ctx, steps), cursor)) return 'raced';
      const delta = await writer.write(ctx, tx, cursor.index, end, prepared);
      const commit = added(counts, delta, { step: cursor.step, index: end });
      await tx.migrations.transition(batch.organizationId, batch.id, 'importing', { counts: { ...locked.counts, commit }, updatedAt: deps.now() });
      return 'written';
    });
  } catch (error) {
    await writer.discard?.(ctx, prepared);
    throw error;
  }
}

/**
 * Runs the steps chunk after chunk from where the stored cursor says, until every step is done. Returns false when the
 * batch stopped being `importing` meanwhile (finished by another run, or failed).
 */
export async function runCommitSteps(ctx: MigrationCommitContext, steps: CommitSteps): Promise<boolean> {
  const { deps, batch } = ctx;
  for (;;) {
    const current = await deps.migrations.findById(batch.organizationId, batch.id);
    if (!current || current.status !== 'importing') return false;
    const cursor = nextCursor(commitCountsOf(current).cursor, ctx, steps);
    if (cursor === null) return true;
    if ((await writeChunk(ctx, steps, cursor)) === 'stopped') return false;
  }
}
