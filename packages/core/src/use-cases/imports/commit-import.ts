import {
  IMPORT_COMMIT_CHUNK,
  IMPORT_NOTE_MAX,
  IMPORT_RECONFIRM_DAYS,
  placeholderEmail,
  type Application,
  type Candidate,
  type ImportBatch,
  type ImportItem,
  type Job,
  type ParsedImportCv,
} from '@tt/domain';
import { z } from 'zod';
import type { ImportCommitDeps, ImportCommitRepositories } from '../../import-ports.js';
import { ConflictError, NotFoundError } from '../../errors.js';
import { inTransaction } from '../../transaction.js';
import { defineSystemJob } from '../../use-case.js';
import { requireJob } from '../jobs/shared.js';
import { queueReconfirmation } from './reconfirm-mail.js';
import { assertStatus, purgeBatchData, requireBatch, SYSTEM_ACTOR } from './shared.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** An item whose CV was read, checked and copied to its final key, ready to be written. */
interface Prepared {
  readonly item: ImportItem;
  readonly candidateId: string;
  readonly applicationId: string;
  readonly cv: ParsedImportCv;
  readonly stored: { readonly key: string; readonly fileName: string; readonly mediaType: Application['cv']['mediaType']; readonly sizeBytes: number };
}

interface Written {
  readonly prepared: Prepared;
  /** `skipped`: already applied; `taken`: another run of the commit wrote this item first. */
  readonly outcome: 'created' | 'merged' | 'skipped' | 'taken';
  /** The candidate the application went to: the new one, or the existing one for a merge. */
  readonly candidateId: string;
  readonly secret: string | null;
}

const isKept = (written: Written): boolean => written.outcome === 'created' || written.outcome === 'merged';

interface Context {
  readonly deps: ImportCommitDeps;
  readonly batch: ImportBatch;
  readonly importedAt: Date;
  readonly expiresAt: Date;
}

const stored = (organizationId: string, applicationId: string): string => `organizations/${organizationId}/applications/${applicationId}/cv`;

async function prepare(ctx: Context, item: ImportItem, cvs: ReadonlyMap<string, ParsedImportCv>): Promise<Prepared | { readonly item: ImportItem; readonly error: string }> {
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

function newCandidate(ctx: Context, prepared: Prepared): Candidate {
  const person = prepared.item.proposal.candidate;
  const { importedAt, expiresAt, batch } = ctx;
  return {
    id: prepared.candidateId,
    organizationId: batch.organizationId,
    firstName: person.firstName || person.lastName || '-',
    lastName: person.firstName === '' ? '' : person.lastName,
    email: person.email ?? placeholderEmail(prepared.candidateId),
    phone: person.phone,
    linkedinUrl: person.linkedinUrl,
    tags: person.tags,
    talentPool: false,
    retentionExpiresAt: expiresAt,
    importBatchId: batch.id,
    createdAt: importedAt,
    updatedAt: importedAt,
  };
}

function newApplication(ctx: Context, prepared: Prepared, candidateId: string): Application {
  const { importedAt, expiresAt, batch } = ctx;
  return {
    id: prepared.applicationId,
    organizationId: batch.organizationId,
    jobId: batch.jobId,
    candidateId,
    stageId: batch.stageId,
    outcome: null,
    message: '',
    cv: prepared.stored,
    // Nothing was agreed: the placeholders say so, `consentStatus` is what counts (see ConsentRecord).
    consent: { privacyNoticeId: '', privacyNoticeVersion: 0, scopes: [], givenAt: importedAt },
    consentStatus: 'to_renew',
    importBatchId: batch.id,
    retentionExpiresAt: expiresAt,
    source: 'import',
    origin: 'import',
    createdAt: importedAt,
    updatedAt: importedAt,
    stageChangedAt: importedAt,
    closedAt: null,
    responseDueAt: null,
    respondedAt: null,
  };
}

async function writeItem(ctx: Context, repos: ImportCommitRepositories, prepared: Prepared): Promise<Written> {
  const { deps, batch } = ctx;
  const { organizationId } = batch;
  const person = prepared.item.proposal.candidate;
  const existing = person.email === null ? null : await repos.candidates.findByEmail(organizationId, person.email);
  if (existing && (await repos.applications.findOpen(organizationId, batch.jobId, existing.id))) {
    await repos.importItems.setStatus(organizationId, prepared.item.id, 'failed', 'already_applied');
    return { prepared, outcome: 'skipped', candidateId: existing.id, secret: null };
  }
  const candidate = existing ?? (await repos.candidates.create(newCandidate(ctx, prepared)));
  const application = await repos.applications.create(newApplication(ctx, prepared, candidate.id));
  // The application enters its stage now, like one from the careers page: without the event the funnel would not count it.
  await repos.stageEvents.record({
    id: deps.newId(),
    organizationId,
    applicationId: application.id,
    jobId: batch.jobId,
    fromStageId: null,
    toStageId: application.stageId,
    outcome: null,
    occurredAt: ctx.importedAt,
    actorType: 'system',
    backfilled: false,
  });
  const parsed = prepared.cv;
  await repos.extractions.upsert({
    applicationId: application.id,
    organizationId,
    status: parsed.extraction ? 'done' : 'text_only',
    text: parsed.text,
    data: parsed.extraction,
    source: parsed.extraction ? 'model' : 'text',
    updatedAt: ctx.importedAt,
  });
  if (person.note !== null && person.note.trim() !== '') {
    await repos.notes.create({ id: deps.newId(), organizationId, candidateId: candidate.id, applicationId: application.id, authorId: batch.createdBy, body: person.note.slice(0, IMPORT_NOTE_MAX), createdAt: ctx.importedAt });
  }
  let secret: string | null = null;
  if (person.email !== null) {
    secret = deps.newSecret();
    await repos.consentTokens.create({ tokenHash: deps.hash(secret), organizationId, applicationId: application.id, expiresAt: ctx.expiresAt, usedAt: null, createdAt: ctx.importedAt });
  }
  await repos.importItems.setStatus(organizationId, prepared.item.id, 'imported', null);
  return { prepared, outcome: existing ? 'merged' : 'created', candidateId: candidate.id, secret };
}

/** Only items still pending are failed and counted: one another run of the commit already wrote stays as it is. */
async function failItems(ctx: Context, items: readonly { readonly item: ImportItem; readonly error: string }[]): Promise<void> {
  let failed = 0;
  for (const { item, error } of items) if (await ctx.deps.importItems.setStatus(ctx.batch.organizationId, item.id, 'failed', error)) failed += 1;
  await ctx.deps.imports.addCounts(ctx.batch.organizationId, ctx.batch.id, { failed });
}

async function sendEmails(ctx: Context, job: Job, written: readonly Written[]): Promise<void> {
  const organization = await ctx.deps.organizations.findById(ctx.batch.organizationId);
  if (!organization) throw new NotFoundError('Organization not found.');
  let queued = 0;
  for (const { prepared, candidateId, secret } of written) {
    if (secret === null) continue;
    const person = prepared.item.proposal.candidate;
    const ok = await queueReconfirmation(ctx.deps, {
      organization,
      job,
      applicationId: prepared.applicationId,
      candidate: { id: candidateId, firstName: person.firstName },
      secret,
    });
    if (ok) queued += 1;
  }
  await ctx.deps.imports.addCounts(ctx.batch.organizationId, ctx.batch.id, { emailsQueued: queued });
}

/**
 * Inside the chunk's transaction. The batch row is locked, so a second run of the commit (a redelivered task) waits and
 * then sees which items this one wrote: it writes only those still pending. The job is share-locked, so it cannot close
 * while the chunk adds open applications.
 */
async function writeChunk(ctx: Context, repos: ImportCommitRepositories, prepared: readonly Prepared[]): Promise<readonly Written[]> {
  const { organizationId, jobId, id } = ctx.batch;
  await repos.imports.lock(organizationId, id);
  const job = await repos.jobs.lock(organizationId, jobId, 'share');
  if (!job || job.status === 'closed') throw new ConflictError('job_closed');
  const pending = new Set((await repos.importItems.listAll(organizationId, id)).filter((item) => item.status === 'pending').map((item) => item.id));
  const done: Written[] = [];
  for (const entry of prepared) {
    done.push(pending.has(entry.item.id) ? await writeItem(ctx, repos, entry) : { prepared: entry, outcome: 'taken', candidateId: '', secret: null });
  }
  const kept = done.filter(isKept);
  await repos.imports.addCounts(organizationId, id, {
    imported: kept.length,
    merged: kept.filter((w) => w.outcome === 'merged').length,
    failed: done.filter((w) => w.outcome === 'skipped').length,
  });
  return done;
}

/**
 * One chunk: files first, then ONE transaction for all its rows and its counts, then the emails. A failed chunk leaves
 * no row and no copied file. The counts are stored with each chunk, so a crash later loses none of them.
 */
async function commitChunk(ctx: Context, job: Job, items: readonly ImportItem[], cvs: ReadonlyMap<string, ParsedImportCv>): Promise<void> {
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
    const message = error instanceof Error ? error.message.slice(0, 200) : 'write_failed';
    await failItems(ctx, prepared.map(({ item }) => ({ item, error: message })));
    return;
  }
  for (const w of written.filter((entry) => !isKept(entry))) await ctx.deps.files.delete(w.prepared.stored.key).catch(() => undefined);
  await sendEmails(ctx, job, written.filter(isKept));
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

/**
 * Worker (`import.commit`). Writes the included items in chunks of IMPORT_COMMIT_CHUNK, one transaction per chunk: a
 * candidate (or, for someone already in the database, only an application: nothing existing is overwritten), the
 * application in the target stage with `consentStatus: 'to_renew'` and retention of IMPORT_RECONFIRM_DAYS, the CV copied to
 * its final key, the extraction, the row notes, a single-use consent token and the chunk's counts. A closed job takes no
 * more applications: its chunks fail. After each chunk the reconfirmation emails are queued as system messages.
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
    const job = await requireJob(deps, batch.organizationId, batch.jobId);
    const analysis = await deps.importAnalyses.find(batch.organizationId, batch.id);
    if (!analysis) throw new NotFoundError('Import data not found.');
    const importedAt = deps.now();
    const ctx: Context = { deps, batch, importedAt, expiresAt: new Date(importedAt.getTime() + IMPORT_RECONFIRM_DAYS * DAY_MS) };
    const cvs = new Map(analysis.cvs.map((cv) => [cv.key, cv]));
    const pending = (await deps.importItems.listAll(batch.organizationId, batch.id)).filter((item) => item.included && item.status === 'pending');
    for (let start = 0; start < pending.length; start += IMPORT_COMMIT_CHUNK) {
      await commitChunk(ctx, job, pending.slice(start, start + IMPORT_COMMIT_CHUNK), cvs);
    }
    return purgeBatchData(deps, await finish(deps, batch, importedAt));
  },
});
