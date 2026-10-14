import type { AuditActor, ErasureReason } from '@tt/domain';
import type { ErasableApplication, ErasureDeps } from '../../privacy-ports.js';
import { afterCommitOrNow, baseDeps, type TransactionalDeps } from '../../transaction.js';
import { recordEvent } from '../webhooks/record-event.js';

export interface EraseInput {
  readonly organizationId: string;
  readonly candidateId: string;
  /** The applications to erase; absent: every application of the candidate. */
  readonly applicationIds?: readonly string[] | undefined;
  readonly reason: ErasureReason;
  readonly actor: AuditActor;
  /**
   * Re-checked on the locked rows inside the erasure transaction: only the applications that still pass it go. The
   * retention job passes "still expired, consent unchanged": someone who reconfirmed meanwhile is kept.
   */
  readonly onlyIf?: ((application: ErasableApplication) => boolean) | undefined;
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
  /** `result` is what the committed erasure did: callers count it as erased. */
  constructor(
    readonly keys: readonly string[],
    readonly result: EraseResult,
  ) {
    super(`${keys.length} stored file(s) could not be deleted or queued for deletion.`);
    this.name = 'FileCleanupError';
  }
}

/** What the erasure transaction decided and deleted. */
interface Erased {
  readonly result: EraseResult;
  readonly keys: readonly string[];
}

/**
 * After the commit (or right away outside a transaction): delete the files, queue a retry for those that fail. Inside a
 * caller's transaction, the queue used is the one outside it (the transaction is over by then), and keys that could be
 * neither deleted nor queued go to the transaction's error sink as `FileCleanupError`: the erasure itself stands.
 */
async function deleteFilesAfterCommit(deps: ErasureDeps & Partial<TransactionalDeps>, organizationId: string, erased: Erased): Promise<void> {
  const inTransaction = deps.afterCommit !== undefined;
  const base = baseDeps(deps);
  let lost: readonly string[] = [];
  await afterCommitOrNow(deps, async () => {
    lost = await deleteFilesAfterErasure(base, organizationId, erased.keys);
    if (inTransaction && lost.length > 0) deps.transaction?.onEffectError?.(new FileCleanupError(lost, erased.result));
  });
  if (!inTransaction && lost.length > 0) throw new FileCleanupError(lost, erased.result);
}

/**
 * THE erasure (PRODUCT.md §6), used by the recruiter's request, the consent withdrawal and the retention job: nothing else
 * deletes candidate data. In one transaction it locks the candidate and their applications, picks again the ones to
 * erase from what is locked (`applicationIds`, `onlyIf`), removes them and everything hanging from them, the candidate
 * when no application is left, and writes the audit event `candidate.erased` (ids and counts only) and the webhook
 * event of the same name. Nothing left to erase: nothing is written. The CV files are deleted only once the erasure is
 * committed, the caller's transaction included: a rollback never leaves rows without their files.
 */
export async function eraseCandidateData(deps: ErasureDeps & Partial<TransactionalDeps>, input: EraseInput): Promise<EraseResult> {
  const { organizationId, candidateId } = input;
  const wanted = input.applicationIds === undefined ? undefined : new Set(input.applicationIds);
  const erased = await deps.erasure.run(async ({ store, auditLog, outbox }): Promise<Erased> => {
    const all = await store.lockCandidateApplications(organizationId, candidateId);
    const selected = all.filter((application) => (wanted === undefined || wanted.has(application.id)) && (input.onlyIf?.(application) ?? true));
    const candidateErased = selected.length === all.length;
    if (selected.length === 0 && !candidateErased) return { result: { applicationCount: 0, candidateErased: false }, keys: [] };
    const keys = await store.deleteApplications(
      organizationId,
      selected.map((application) => application.id),
    );
    if (candidateErased) await store.deleteCandidate(organizationId, candidateId);
    const exportKeys = await store.deleteDataExports(organizationId);
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
    return { result: { applicationCount: selected.length, candidateErased }, keys: [...keys, ...exportKeys] };
  });
  await deleteFilesAfterCommit(deps, organizationId, erased);
  return erased.result;
}
