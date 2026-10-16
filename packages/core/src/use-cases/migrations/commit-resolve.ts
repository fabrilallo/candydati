import { RECEIVED_STAGE_ID, type Job, type MigrationStageTargetRef } from '@candydati/domain';
import type { MigrationCommitDeps } from '../../migration-commit-ports.js';
import type { MigrationCommitContext } from './commit-context.js';

/** Emails looked up per query: well under the Postgres parameter limit. */
const EMAIL_LOOKUP_CHUNK = 1000;

/**
 * The candidate id of each person of the chunk, as the people step left them: the existing candidate with their email
 * (merged, or created by this batch), or the batch's own row for a person without an email.
 * @throws Error when a person is missing (erased while the commit ran): the chunk fails and the queue retries it.
 */
export async function resolvePeople(ctx: MigrationCommitContext, tx: MigrationCommitDeps, keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const wanted = [...new Set(keys)];
  const emails = wanted.flatMap((key) => (key.startsWith('email:') ? [key.slice('email:'.length)] : []));
  const found = new Map<string, string>();
  for (let start = 0; start < emails.length; start += EMAIL_LOOKUP_CHUNK) {
    for (const candidate of await tx.candidates.findByEmails(ctx.batch.organizationId, emails.slice(start, start + EMAIL_LOOKUP_CHUNK))) {
      found.set(`email:${candidate.email.toLowerCase()}`, candidate.id);
    }
  }
  return new Map(
    wanted.map((key) => {
      const id = key.startsWith('email:') ? found.get(key) : ctx.rowId('candidate', key);
      if (id === undefined) throw new Error('migration_person_missing');
      return [key, id] as const;
    }),
  );
}

/** A migrated job as stored, with the stage id each package stage of it lands in. */
export interface ResolvedJob {
  readonly job: Job;
  stageIdOf(target: MigrationStageTargetRef | undefined): string;
}

/** The jobs of the chunk as the jobs step stored them (their stage ids were given then). */
export async function resolveJobs(ctx: MigrationCommitContext, tx: MigrationCommitDeps, refs: readonly string[]): Promise<ReadonlyMap<string, ResolvedJob>> {
  const resolved = new Map<string, ResolvedJob>();
  for (const ref of new Set(refs)) {
    const job = await tx.jobs.findById(ctx.batch.organizationId, ctx.rowId('job', ref));
    if (!job) throw new Error('migration_job_missing');
    const ids = job.content.process.map((stage) => stage.id ?? RECEIVED_STAGE_ID);
    resolved.set(ref, { job, stageIdOf: (target) => (target === undefined || target === 'received' ? RECEIVED_STAGE_ID : (ids[target] ?? RECEIVED_STAGE_ID)) });
  }
  return resolved;
}
