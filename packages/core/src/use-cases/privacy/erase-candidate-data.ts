import type { AuditActor, ErasureReason } from '@tt/domain';
import type { ErasureDeps } from '../../privacy-ports.js';
import { recordEvent } from '../webhooks/record-event.js';

export interface EraseInput {
  readonly organizationId: string;
  readonly candidateId: string;
  /** The applications to erase; absent: every application of the candidate. */
  readonly applicationIds?: readonly string[] | undefined;
  readonly reason: ErasureReason;
  readonly actor: AuditActor;
}

export interface EraseResult {
  readonly applicationCount: number;
  /** True when no application remained, so the candidate itself is gone. */
  readonly candidateErased: boolean;
}

/**
 * Deletes a file; when that fails, the key goes to a `files.delete` task so the worker retries it. The database no
 * longer references the key either way. Returns the keys that could be neither deleted nor queued.
 */
export async function deleteFilesAfterErasure(
  deps: Pick<ErasureDeps, 'files' | 'queue'>,
  organizationId: string,
  keys: readonly string[],
): Promise<readonly string[]> {
  const lost: string[] = [];
  for (const key of keys) {
    try {
      await deps.files.delete(key);
    } catch {
      try {
        await deps.queue.enqueue('files.delete', { organizationId, key });
      } catch {
        lost.push(key);
      }
    }
  }
  return lost;
}

/** The erasure happened, but some stored files are neither deleted nor queued for deletion. `keys` is for the logs. */
export class FileCleanupError extends Error {
  constructor(readonly keys: readonly string[]) {
    super(`${keys.length} stored file(s) could not be deleted or queued for deletion.`);
    this.name = 'FileCleanupError';
  }
}

/**
 * THE erasure (PLAN §7), used by the recruiter's request, the consent withdrawal and the retention job: nothing else
 * deletes candidate data. In one transaction it removes the applications and everything hanging from them, the
 * candidate when no application is left, and writes the audit event `candidate.erased` (ids and counts only) and the
 * webhook event of the same name. After the commit it deletes the CV files; the ones that fail are retried by the worker.
 */
export async function eraseCandidateData(deps: ErasureDeps, input: EraseInput): Promise<EraseResult> {
  const { organizationId, candidateId } = input;
  const all = await deps.applications.listByCandidate(organizationId, candidateId);
  const wanted = input.applicationIds === undefined ? undefined : new Set(input.applicationIds);
  const selected = all.filter((application) => wanted === undefined || wanted.has(application.id));
  const candidateErased = selected.length === all.length;
  const keys = await deps.erasure.run(async ({ store, auditLog, outbox }) => {
    const cvKeys = await store.deleteApplications(
      organizationId,
      selected.map((application) => application.id),
    );
    if (candidateErased) await store.deleteCandidate(organizationId, candidateId);
    await auditLog.append({
      organizationId,
      actor: input.actor,
      action: 'candidate.erased',
      target: { type: 'candidate', id: candidateId },
      metadata: { reason: input.reason, applicationCount: selected.length },
    });
    await recordEvent({ outbox, newId: deps.newId, now: deps.now }, organizationId, 'candidate.erased', {
      candidateId,
      applicationCount: selected.length,
      candidateErased,
    });
    return cvKeys;
  });
  const lost = await deleteFilesAfterErasure(deps, organizationId, keys);
  if (lost.length > 0) throw new FileCleanupError(lost);
  return { applicationCount: selected.length, candidateErased };
}
