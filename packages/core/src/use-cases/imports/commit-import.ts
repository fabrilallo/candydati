import { DAY_MS, IMPORT_COMMIT_CHUNK, IMPORT_RECONFIRM_DAYS, type ImportBatch, type ImportItem, type ParsedImportCv } from '@candydati/domain';
import { z } from 'zod';
import type { ImportCommitDeps, ImportCommitRepositories } from '../../import-ports.js';
import { ConflictError, isTransientError, NotFoundError } from '../../errors.js';
import { inTransaction } from '../../transaction.js';
import { defineSystemJob } from '../../use-case.js';
import { requireJob } from '../jobs/shared.js';
import { isKept, itemErrorCode, writeItem, type CommitContext, type Prepared, type Written } from './commit-item.js';
import { assertStatus, purgeBatchData, requireBatch, SYSTEM_ACTOR } from './shared.js';

/** Attempts of one item inside its chunk when the database says "try again" (deadlock, serialization failure). */
export const ITEM_ATTEMPTS = 3;

const stored = (organizationId: string, applicationId: string): string => `organizations/${organizationId}/applications/${applicationId}/cv`;

async function prepare(ctx: CommitContext, item: ImportItem, cvs: ReadonlyMap<string, ParsedImportCv>): Promise<Prepared | { readonly item: ImportItem; readonly error: string }> {
  const { deps, batch } = ctx;
  const ref = item.proposal.cv;
  const cv = ref ? cvs.get(ref.key) : undefined;
  if (!ref || !cv) return { item, error: 'cv_required' };
  let bytes: Uint8Array;
  try {
    bytes = await deps.files.get(ref.key);
  } catch {
    return { item, error: 'cv_unreadable' };
  }
  const sniffed = deps.cvSniffer(bytes, ref.fileName);
  if (!sniffed) return { item, error: 'unsupported_file' };
  const applicationId = deps.newId();
  const key = stored(batch.organizationId, applicationId);
  try {
    await deps.files.put(key, bytes, sniffed.mediaType);
  } catch {
    return { item, error: 'cv_copy_failed' };
  }
  return { item, candidateId: deps.newId(), applicationId, cv, stored: { key, fileName: sniffed.fileName, mediaType: sniffed.mediaType, sizeBytes: bytes.byteLength } };
}

/** Only items still pending are failed and counted: one another run of the commit already wrote stays as it is. */
async function failItems(ctx: CommitContext, items: readonly { readonly item: ImportItem; readonly error: string }[]): Promise<void> {
  let failed = 0;
  for (const { item, error } of items) if (await ctx.deps.importItems.setStatus(ctx.batch.organizationId, item.id, 'failed', error)) failed += 1;
  await ctx.deps.imports.addCounts(ctx.batch.organizationId, ctx.batch.id, { failed });
}

/**
 * One item in its own savepoint: a failure undoes only that item, which is marked failed with an error code. A transient
 * database error is retried in place; when it persists it fails the whole chunk, which the queue retries later.
 */
async function writeIsolated(ctx: CommitContext, repos: ImportCommitRepositories, prepared: Prepared): Promise<Written> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await repos.savepoint(() => writeItem(ctx, repos, prepared));
    } catch (error) {
      if (isTransientError(error)) {
        if (attempt < ITEM_ATTEMPTS) continue;
        throw error;
      }
      await repos.importItems.setStatus(ctx.batch.organizationId, prepared.item.id, 'failed', itemErrorCode(error));
      return { prepared, outcome: 'failed', candidateId: '', messageId: null };
    }
  }
}

/**
 * Inside the chunk's transaction. The batch row is locked, so a second run of the commit (a redelivered task) waits and
 * then sees which items this one wrote: it writes only those still pending. The job is share-locked, so it cannot close
 * while the chunk adds open applications.
 */
async function writeChunk(ctx: CommitContext, repos: ImportCommitRepositories, prepared: readonly Prepared[]): Promise<readonly Written[]> {
  const { organizationId, jobId, id } = ctx.batch;
  await repos.imports.lock(organizationId, id);
  const job = await repos.jobs.lock(organizationId, jobId, 'share');
  if (!job || job.status === 'closed') throw new ConflictError('job_closed');
  const pending = new Set((await repos.importItems.listAll(organizationId, id)).filter((item) => item.status === 'pending').map((item) => item.id));
  const done: Written[] = [];
  for (const entry of prepared) {
    done.push(pending.has(entry.item.id) ? await writeIsolated(ctx, repos, entry) : { prepared: entry, outcome: 'taken', candidateId: '', messageId: null });
  }
  const kept = done.filter(isKept);
  await repos.imports.addCounts(organizationId, id, {
    imported: kept.length,
    merged: kept.filter((w) => w.outcome === 'merged').length,
    failed: done.filter((w) => w.outcome === 'skipped' || w.outcome === 'failed').length,
    emailsQueued: kept.filter((w) => w.messageId !== null).length,
  });
  return done;
}

/**
 * The reconfirmation requests are stored, queued messages: their delivery is queued now. A failure leaves the message
 * `queued`, and the reconciler queues it again: nobody is erased without having been asked.
 */
async function enqueueDeliveries(ctx: CommitContext, written: readonly Written[]): Promise<void> {
  for (const { messageId } of written) {
    if (messageId === null) continue;
    try {
      await ctx.deps.queue.enqueue('email.send', { organizationId: ctx.batch.organizationId, messageId }, { singletonKey: messageId });
    } catch (error) {
      ctx.deps.onMailError?.(error);
    }
  }
}

/**
 * One chunk: files first, then ONE transaction for all its rows, messages and counts (each item in a savepoint), then
 * the deliveries. A failed chunk leaves no row and no copied file. A transient failure is rethrown so the queue retries
 * the task (only pending items are written again); any other one fails the chunk's items with an error code.
 */
async function commitChunk(ctx: CommitContext, items: readonly ImportItem[], cvs: ReadonlyMap<string, ParsedImportCv>): Promise<void> {
  const prepared: Prepared[] = [];
  const rejected: { item: ImportItem; error: string }[] = [];
  for (const item of items) {
    const result = await prepare(ctx, item, cvs);
    if ('error' in result) rejected.push(result);
    else prepared.push(result);
  }
  await failItems(ctx, rejected);
  let written: readonly Written[];
  try {
    written = await ctx.deps.commit.run((repos) => writeChunk(ctx, repos, prepared));
  } catch (error) {
    for (const entry of prepared) await ctx.deps.files.delete(entry.stored.key).catch(() => undefined);
    if (isTransientError(error)) throw error;
    await failItems(ctx, prepared.map(({ item }) => ({ item, error: itemErrorCode(error) })));
    return;
  }
  for (const w of written.filter((entry) => !isKept(entry))) await ctx.deps.files.delete(w.prepared.stored.key).catch(() => undefined);
  await enqueueDeliveries(ctx, written.filter(isKept));
}

/** The final status and `import.committed` (counts only) in one transaction, BEFORE the purge: a crash after it only leaves a purge to redo. */
async function finish(deps: ImportCommitDeps, batch: ImportBatch, importedAt: Date): Promise<ImportBatch> {
  const current = await requireBatch(deps, batch.organizationId, batch.id);
  const nothing = current.counts.imported === 0 && current.counts.failed > 0;
  return inTransaction(deps, async (tx) => {
    const done = await tx.imports.transition(batch.organizationId, batch.id, 'importing', {
      status: nothing ? 'failed' : 'done',
      importedAt,
      error: nothing ? 'nothing_imported' : null,
    });
    await tx.auditLog.append({
      organizationId: batch.organizationId,
      actor: SYSTEM_ACTOR,
      action: 'import.committed',
      target: { type: 'import_batch', id: batch.id },
      metadata: { jobId: batch.jobId, ...done.counts },
    });
    return done;
  });
}

const inputSchema = z.object({ organizationId: z.string().min(1), batchId: z.string().min(1) });

async function contextFor(deps: ImportCommitDeps, batch: ImportBatch): Promise<CommitContext> {
  const job = await requireJob(deps, batch.organizationId, batch.jobId);
  const organization = await deps.organizations.findById(batch.organizationId);
  if (!organization) throw new NotFoundError('Organization not found.');
  const importedAt = deps.now();
  return { deps, batch, job, organization, importedAt, expiresAt: new Date(importedAt.getTime() + IMPORT_RECONFIRM_DAYS * DAY_MS) };
}

/**
 * Worker (`import.commit`). Writes the included items in chunks of IMPORT_COMMIT_CHUNK, one transaction per chunk: a
 * candidate (or, for someone already in the database, only an application: nothing existing is overwritten), the
 * application in the target stage with `consentStatus: 'to_renew'` and retention of IMPORT_RECONFIRM_DAYS, the CV copied to
 * its final key, the extraction, the row notes, a single-use consent token and the chunk's counts. A closed job takes no
 * more applications: its chunks fail. Each item is written in its own savepoint: one failing item is marked failed with
 * an error code (never the error's text) and the others go in. The reconfirmation request is stored with the person as
 * a queued system message (its link is put in at send time, see `consent-link.ts`) and its delivery is queued after
 * the chunk commits.
 * Resumable: only `pending` items are written, so a retry continues. At the end the batch is `done` (or `failed` when
 * nothing went in) together with `import.committed` (counts only), then the proposed people and the uploaded originals
 * are deleted; a retry that finds the batch finished only completes that deletion.
 */
export const commitImport = defineSystemJob<ImportCommitDeps, typeof inputSchema, ImportBatch>({
  name: 'commitImport',
  input: inputSchema,
  handler: async ({ deps, input }) => {
    const batch = await requireBatch(deps, input.organizationId, input.batchId);
    if (batch.status === 'done' || batch.status === 'failed') return purgeBatchData(deps, batch);
    assertStatus(batch, ['importing']);
    const analysis = await deps.importAnalyses.find(batch.organizationId, batch.id);
    if (!analysis) throw new NotFoundError('Import data not found.');
    const ctx = await contextFor(deps, batch);
    const cvs = new Map(analysis.cvs.map((cv) => [cv.key, cv]));
    const pending = (await deps.importItems.listAll(batch.organizationId, batch.id)).filter((item) => item.included && item.status === 'pending');
    for (let start = 0; start < pending.length; start += IMPORT_COMMIT_CHUNK) {
      await commitChunk(ctx, pending.slice(start, start + IMPORT_COMMIT_CHUNK), cvs);
    }
    return purgeBatchData(deps, await finish(deps, batch, ctx.importedAt));
  },
});
