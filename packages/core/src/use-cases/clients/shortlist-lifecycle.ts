import type { AuditActor, ClientShortlist } from '@candydati/domain';
import type { ClientRepository, ShortlistRepository } from '../../client-ports.js';
import type { JobRepository } from '../../job-ports.js';
import type { AuditLogRepository } from '../../ports.js';

/** Why a shortlist was revoked by the system rather than by a person. */
export type ShortlistEndReason = 'job_closed' | 'client_archived' | 'contact_removed';

export interface ShortlistContextDeps {
  readonly jobs: Pick<JobRepository, 'findById'>;
  readonly clients: Pick<ClientRepository, 'findById'>;
}

/**
 * Whether a shortlist still has a reason to exist: its job open, its client active and the contact it went to still one
 * of the client's contacts. Null while it does; otherwise why not. A shortlist never outlives its context: a removed
 * contact must not keep receiving candidate data.
 */
export async function shortlistEndReason(deps: ShortlistContextDeps, shortlist: ClientShortlist): Promise<ShortlistEndReason | null> {
  const job = await deps.jobs.findById(shortlist.organizationId, shortlist.jobId);
  if (!job || job.status === 'closed') return 'job_closed';
  const client = await deps.clients.findById(shortlist.organizationId, shortlist.clientId);
  if (!client || client.archivedAt !== null) return 'client_archived';
  return client.contacts.some((contact) => contact.id === shortlist.recipientContactId) ? null : 'contact_removed';
}

/** Revokes it and audits why (ids only). False when it was already revoked. */
export async function endShortlist(
  deps: { readonly shortlists: Pick<ShortlistRepository, 'revoke'>; readonly auditLog: AuditLogRepository },
  shortlist: ClientShortlist,
  reason: ShortlistEndReason,
  actor: AuditActor,
  at: Date,
): Promise<boolean> {
  if (!(await deps.shortlists.revoke(shortlist.organizationId, shortlist.id, at))) return false;
  await deps.auditLog.append({ organizationId: shortlist.organizationId, actor, action: 'shortlist.revoked', target: { type: 'client_shortlist', id: shortlist.id }, metadata: { reason } });
  return true;
}

/** Closing a job ends its open shortlists in the same transaction: a closed search shows no one to a client. */
export async function endJobShortlists(
  deps: { readonly shortlists?: ShortlistRepository | undefined; readonly auditLog: AuditLogRepository },
  organizationId: string,
  jobId: string,
  actor: AuditActor,
  at: Date,
): Promise<void> {
  const { shortlists } = deps;
  if (!shortlists) return;
  for (const shortlist of await shortlists.listByJob(organizationId, jobId)) {
    if (shortlist.revokedAt === null) await endShortlist({ shortlists, auditLog: deps.auditLog }, shortlist, 'job_closed', actor, at);
  }
}
