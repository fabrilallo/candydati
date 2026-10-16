import {
  MESSAGE_MAX,
  cappedAnswers,
  migratedStageMoves,
  sanitizeOrigin,
  type Application,
  type ApplicationAttachment,
  type PlannedMigrationApplication,
  type StageEvent,
  type StoredFile,
} from '@candydati/domain';
import type { MigrationCommitDeps } from '../../migration-commit-ports.js';
import type { MigrationCommitContext } from './commit-context.js';
import { addSkipped, copyApplicationFiles, NO_SKIPPED } from './commit-files.js';
import { resolveJobs, resolvePeople, type ResolvedJob } from './commit-resolve.js';
import type { CommitDelta, CommitStepWriter, PreparedFiles } from './commit-runner.js';

/** Applications per transaction: each may carry a CV and attachments of up to 10 MiB each, read one at a time. */
export const APPLICATION_CHUNK = 25;

/** Copies the files of the chunk's applications (`copyApplicationFiles`) before its transaction. */
async function prepare(ctx: MigrationCommitContext, from: number, to: number): Promise<PreparedFiles> {
  const cvs = new Map<string, StoredFile>();
  const attachments = new Map<string, readonly ApplicationAttachment[]>();
  let skipped = NO_SKIPPED;
  for (const entry of ctx.plan.applications.slice(from, to)) {
    if (entry.duplicate) continue;
    const files = await copyApplicationFiles(ctx, entry);
    if (files.cv) cvs.set(entry.application.ref, files.cv);
    if (files.attachments.length > 0) attachments.set(entry.application.ref, files.attachments);
    skipped = addSkipped(skipped, files.skipped);
  }
  return { cvs, attachments, skipped };
}

/** After a failed transaction: nothing points to these files, so none may stay. */
async function discard(ctx: MigrationCommitContext, prepared: PreparedFiles): Promise<void> {
  const keys = [...[...prepared.cvs.values()].map((cv) => cv.key), ...[...prepared.attachments.values()].flat().map((attachment) => attachment.key)];
  for (const key of keys) await ctx.deps.files.delete(key).catch(() => undefined);
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
    answers: cappedAnswers(application.answers),
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

/**
 * One application with its history, its attachments and, when it has a CV, its pending extraction (`cv.extract` runs
 * once the chunk commits).
 */
async function writeOne(ctx: MigrationCommitContext, tx: MigrationCommitDeps, entry: PlannedMigrationApplication, candidateId: string, job: ResolvedJob, prepared: PreparedFiles): Promise<number> {
  const cv = prepared.cvs.get(entry.application.ref) ?? null;
  const application = await tx.applications.create(applicationOf(ctx, entry, candidateId, job, cv));
  const events = historyOf(ctx, entry, application, job);
  await tx.migratedRows.insertStageEvents(ctx.batch.id, events);
  await tx.migratedRows.insertAttachments(ctx.batch.id, prepared.attachments.get(entry.application.ref) ?? []);
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
    stageEvents += await writeOne(ctx, tx, entry, candidateId, job, prepared);
  }
  const { skipped } = prepared;
  return {
    applications: written.length,
    skippedAlreadyApplied: entries.length - written.length,
    cvs: prepared.cvs.size,
    attachments: [...prepared.attachments.values()].reduce((sum, list) => sum + list.length, 0),
    filesSkipped: skipped.type + skipped.size + skipped.missing,
    filesSkippedType: skipped.type,
    filesSkippedSize: skipped.size,
    filesSkippedMissing: skipped.missing,
    answers: written.filter((entry) => cappedAnswers(entry.application.answers) !== null).length,
    stageEvents,
  };
}

export const applicationsStep: CommitStepWriter = { size: APPLICATION_CHUNK, length: (ctx) => ctx.plan.applications.length, prepare, discard, write };
