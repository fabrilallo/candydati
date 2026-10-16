import {
  CV_MAX_BYTES,
  MESSAGE_MAX,
  migratedStageMoves,
  sanitizeOrigin,
  type Application,
  type PlannedMigrationApplication,
  type StageEvent,
  type StoredFile,
} from '@candydati/domain';
import type { MigrationCommitDeps } from '../../migration-commit-ports.js';
import type { MigrationCommitContext } from './commit-context.js';
import { resolveJobs, resolvePeople, type ResolvedJob } from './commit-resolve.js';
import type { CommitDelta, CommitStepWriter, PreparedFiles } from './commit-runner.js';

/** Applications per transaction: each may carry a CV of up to 10 MiB, read one at a time. */
export const APPLICATION_CHUNK = 25;

const cvKey = (organizationId: string, applicationId: string): string => `organizations/${organizationId}/applications/${applicationId}/cv`;

/**
 * The CV of one application, copied to the key every application's CV has (like the import's `prepare()`): the first
 * file declared `cv` that is really a PDF or a Word document and not larger than a CV may be. The other files have no
 * place to live (no attachment store yet): they are counted as skipped, never stored where an erasure could miss them.
 */
async function copyCv(ctx: MigrationCommitContext, entry: PlannedMigrationApplication): Promise<StoredFile | null> {
  const { deps, batch } = ctx;
  for (const file of entry.application.files.filter((f) => f.kind === 'cv')) {
    const stored = ctx.files.get(file.path);
    if (!stored || stored.size > CV_MAX_BYTES) continue;
    const bytes = await stored.read();
    const sniffed = deps.cvSniffer(bytes, file.fileName);
    if (!sniffed) continue;
    const key = cvKey(batch.organizationId, ctx.rowId('application', entry.application.ref));
    await deps.files.put(key, bytes, sniffed.mediaType);
    return { key, fileName: sniffed.fileName, mediaType: sniffed.mediaType, sizeBytes: bytes.byteLength };
  }
  return null;
}

async function prepare(ctx: MigrationCommitContext, from: number, to: number): Promise<PreparedFiles> {
  const cvs = new Map<string, StoredFile>();
  let skipped = 0;
  for (const entry of ctx.plan.applications.slice(from, to)) {
    if (entry.duplicate) continue;
    const cv = await copyCv(ctx, entry);
    if (cv) cvs.set(entry.application.ref, cv);
    skipped += entry.application.files.length - (cv ? 1 : 0);
  }
  return { cvs, skipped };
}

async function discard(ctx: MigrationCommitContext, prepared: PreparedFiles): Promise<void> {
  for (const cv of prepared.cvs.values()) await ctx.deps.files.delete(cv.key).catch(() => undefined);
}

function applicationOf(ctx: MigrationCommitContext, entry: PlannedMigrationApplication, candidateId: string, job: ResolvedJob, cv: StoredFile | null): Application {
  const { application } = entry;
  const planned = ctx.jobsByRef.get(application.jobRef);
  const closedAt = application.outcome === undefined ? null : new Date(application.closedAt ?? entry.stageChangedAt);
  return {
    id: ctx.rowId('application', application.ref),
    organizationId: ctx.batch.organizationId,
    jobId: job.job.id,
    candidateId,
    stageId: job.stageIdOf(planned?.targets.get(application.stageRef)),
    outcome: application.outcome ?? null,
    message: application.coverLetter?.slice(0, MESSAGE_MAX) ?? '',
    cv,
    consent: entry.consent,
    consentStatus: entry.consentStatus,
    importBatchId: null,
    migrationBatchId: ctx.batch.id,
    retentionExpiresAt: entry.retentionExpiresAt,
    source: 'import',
    origin: sanitizeOrigin(application.origin ?? ctx.sourceSystem),
    createdAt: new Date(application.createdAt),
    updatedAt: ctx.at,
    stageChangedAt: entry.stageChangedAt,
    closedAt,
    responseDueAt: null,
    respondedAt: null,
  };
}

/** The stage history as backfilled events, by the system, moves inside one merged stage left out. */
function historyOf(ctx: MigrationCommitContext, entry: PlannedMigrationApplication, application: Application, job: ResolvedJob): readonly StageEvent[] {
  const targets = ctx.jobsByRef.get(entry.application.jobRef)?.targets ?? new Map();
  return migratedStageMoves(entry.application, targets).map((move, index) => ({
    id: ctx.rowId('stage_event', `${entry.application.ref}:${index}`),
    organizationId: application.organizationId,
    applicationId: application.id,
    jobId: application.jobId,
    fromStageId: move.from === null ? null : job.stageIdOf(move.from),
    toStageId: move.to === null ? null : job.stageIdOf(move.to),
    outcome: move.outcome,
    occurredAt: move.at,
    actorType: 'system',
    backfilled: true,
  }));
}

/** One application with its history and, when it has a CV, its pending extraction (`cv.extract` runs once the chunk commits). */
async function writeOne(ctx: MigrationCommitContext, tx: MigrationCommitDeps, entry: PlannedMigrationApplication, candidateId: string, job: ResolvedJob, cv: StoredFile | null): Promise<number> {
  const application = await tx.applications.create(applicationOf(ctx, entry, candidateId, job, cv));
  const events = historyOf(ctx, entry, application, job);
  await tx.migratedRows.insertStageEvents(ctx.batch.id, events);
  if (cv) {
    const payload = { organizationId: application.organizationId, applicationId: application.id };
    await tx.extractions.upsert({ ...payload, status: 'pending', text: null, data: null, source: null, updatedAt: ctx.at });
    await tx.queue.enqueue('cv.extract', payload, { singletonKey: application.id });
  }
  return events.length;
}

async function write(ctx: MigrationCommitContext, tx: MigrationCommitDeps, from: number, to: number, prepared: PreparedFiles): Promise<CommitDelta> {
  const entries = ctx.plan.applications.slice(from, to);
  const written = entries.filter((entry) => !entry.duplicate);
  const people = await resolvePeople(ctx, tx, written.map((entry) => entry.personKey));
  const jobs = await resolveJobs(ctx, tx, written.map((entry) => entry.application.jobRef));
  let stageEvents = 0;
  for (const entry of written) {
    const job = jobs.get(entry.application.jobRef);
    const candidateId = people.get(entry.personKey);
    if (!job || !candidateId) throw new Error('migration_reference_missing');
    stageEvents += await writeOne(ctx, tx, entry, candidateId, job, prepared.cvs.get(entry.application.ref) ?? null);
  }
  return { applications: written.length, skippedAlreadyApplied: entries.length - written.length, cvs: prepared.cvs.size, filesSkipped: prepared.skipped, stageEvents };
}

export const applicationsStep: CommitStepWriter = { size: APPLICATION_CHUNK, length: (ctx) => ctx.plan.applications.length, prepare, discard, write };
