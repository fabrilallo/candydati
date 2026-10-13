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
import { NotFoundError } from '../../errors.js';
import { defineSystemJob } from '../../use-case.js';
import { requireJob } from '../jobs/shared.js';
import { queueReconfirmation } from './reconfirm-mail.js';
import { assertStatus, deleteBatchFiles, requireBatch, SYSTEM_ACTOR, withCounts } from './shared.js';

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
  readonly outcome: 'created' | 'merged' | 'skipped';
  readonly secret: string | null;
}

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
    return { prepared, outcome: 'skipped', secret: null };
  }
  const candidate = existing ?? (await repos.candidates.create(newCandidate(ctx, prepared)));
  const application = await repos.applications.create(newApplication(ctx, prepared, candidate.id));
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
  return { prepared, outcome: existing ? 'merged' : 'created', secret };
}

interface ChunkResult {
  readonly created: number;
  readonly merged: number;
  readonly failed: number;
  readonly emails: number;
}

async function failItems(ctx: Context, items: readonly { readonly item: ImportItem; readonly error: string }[]): Promise<void> {
  for (const { item, error } of items) await ctx.deps.importItems.setStatus(ctx.batch.organizationId, item.id, 'failed', error);
}

async function sendEmails(ctx: Context, job: Job, written: readonly Written[]): Promise<number> {
  const organization = await ctx.deps.organizations.findById(ctx.batch.organizationId);
  if (!organization) throw new NotFoundError('Organization not found.');
  let queued = 0;
  for (const { prepared, secret } of written) {
    if (secret === null) continue;
    const person = prepared.item.proposal.candidate;
    const ok = await queueReconfirmation(ctx.deps, {
      organization,
      job,
      applicationId: prepared.applicationId,
      candidate: { id: prepared.candidateId, firstName: person.firstName },
      secret,
    });
    if (ok) queued += 1;
  }
  return queued;
}

/** One chunk: files first, then ONE transaction for all its rows, then the emails. A failed chunk leaves no row and no copied file. */
async function commitChunk(ctx: Context, job: Job, items: readonly ImportItem[], cvs: ReadonlyMap<string, ParsedImportCv>): Promise<ChunkResult> {
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
    written = await ctx.deps.commit.run(async (repos) => {
      const done: Written[] = [];
      for (const entry of prepared) done.push(await writeItem(ctx, repos, entry));
      return done;
    });
  } catch (error) {
    for (const entry of prepared) await ctx.deps.files.delete(entry.stored.key).catch(() => undefined);
    const message = error instanceof Error ? error.message.slice(0, 200) : 'write_failed';
    await failItems(ctx, prepared.map(({ item }) => ({ item, error: message })));
    return { created: 0, merged: 0, failed: items.length, emails: 0 };
  }
  const kept = written.filter((w) => w.outcome !== 'skipped');
  for (const w of written.filter((entry) => entry.outcome === 'skipped')) await ctx.deps.files.delete(w.prepared.stored.key).catch(() => undefined);
  return {
    created: kept.filter((w) => w.outcome === 'created').length,
    merged: kept.filter((w) => w.outcome === 'merged').length,
    failed: rejected.length + written.length - kept.length,
    emails: await sendEmails(ctx, job, kept),
  };
}

const sum = (results: readonly ChunkResult[], key: keyof ChunkResult): number => results.reduce((total, r) => total + r[key], 0);

/** Applications of the batch are done: the proposed people and parsed inputs are personal data, and go. */
async function purge(deps: ImportCommitDeps, batch: ImportBatch, cvKeys: readonly string[]): Promise<void> {
  await deps.importItems.deleteByBatch(batch.organizationId, batch.id);
  await deps.importAnalyses.delete(batch.organizationId, batch.id);
  await deleteBatchFiles(deps, batch.organizationId, [...batch.sourceFiles.map((f) => f.key), ...cvKeys]);
}

const inputSchema = z.object({ organizationId: z.string().min(1), batchId: z.string().min(1) });

/**
 * Worker (`import.commit`). Writes the included items in chunks of IMPORT_COMMIT_CHUNK, one transaction per chunk: a
 * candidate (or, for someone already in the database, only an application: nothing existing is overwritten), the
 * application in the target stage with `consentStatus: 'to_renew'` and retention of IMPORT_RECONFIRM_DAYS, the CV copied to
 * its final key, the extraction, the row notes and a single-use consent token. After each chunk the reconfirmation
 * emails are queued as system messages. Resumable: only `pending` items are written, so a retry continues. At the end
 * the batch is `done` (or `failed` when nothing went in), `import.committed` is audited with counts only, and the
 * proposed people and the uploaded originals are deleted.
 */
export const commitImport = defineSystemJob<ImportCommitDeps, typeof inputSchema, ImportBatch>({
  name: 'commitImport',
  input: inputSchema,
  handler: async ({ deps, input }) => {
    const batch = await requireBatch(deps, input.organizationId, input.batchId);
    assertStatus(batch, ['importing']);
    const job = await requireJob(deps, batch.organizationId, batch.jobId);
    const analysis = await deps.importAnalyses.find(batch.organizationId, batch.id);
    if (!analysis) throw new NotFoundError('Import data not found.');
    const importedAt = deps.now();
    const ctx: Context = { deps, batch, importedAt, expiresAt: new Date(importedAt.getTime() + IMPORT_RECONFIRM_DAYS * DAY_MS) };
    const cvs = new Map(analysis.cvs.map((cv) => [cv.key, cv]));
    const pending = (await deps.importItems.listAll(batch.organizationId, batch.id)).filter((item) => item.included && item.status === 'pending');
    const results: ChunkResult[] = [];
    for (let start = 0; start < pending.length; start += IMPORT_COMMIT_CHUNK) {
      results.push(await commitChunk(ctx, job, pending.slice(start, start + IMPORT_COMMIT_CHUNK), cvs));
    }
    const imported = batch.counts.imported + sum(results, 'created') + sum(results, 'merged');
    const failed = batch.counts.failed + sum(results, 'failed');
    const counts = {
      imported,
      merged: batch.counts.merged + sum(results, 'merged'),
      failed,
      emailsQueued: batch.counts.emailsQueued + sum(results, 'emails'),
    };
    const done = { ...withCounts(batch, counts), status: imported === 0 && failed > 0 ? ('failed' as const) : ('done' as const), importedAt, error: imported === 0 && failed > 0 ? 'nothing_imported' : null };
    await deps.auditLog.append({
      organizationId: batch.organizationId,
      actor: SYSTEM_ACTOR,
      action: 'import.committed',
      target: { type: 'import_batch', id: batch.id },
      metadata: { jobId: batch.jobId, ...done.counts },
    });
    await purge(deps, batch, analysis.cvs.map((cv) => cv.key));
    return deps.imports.save({ ...done, sourceFiles: [] });
  },
});
