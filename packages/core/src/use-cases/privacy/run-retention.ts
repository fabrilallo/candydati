import { DAY_MS, dataExportKey, RETENTION_DIGEST_KINDS, RETENTION_WARNING_DAYS, type Application, type RetentionRun } from '@tt/domain';
import { z } from 'zod';
import { groupBy } from '../../group-by.js';
import type { RetentionDeps } from '../../privacy-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { OrganizationContext, unsentDigests, type DigestEntry } from '../automations/scan-deadlines.js';
import type { ErasableApplication } from '../../privacy-ports.js';
import { deleteFilesAfterErasure, eraseCandidateData, FileCleanupError } from './erase-candidate-data.js';

/** Applications read per page of the retention scan (keyset on `(retentionExpiresAt, id)`). */
export const RETENTION_PAGE = 500;
const RECIPIENT_ROLES = ['owner', 'admin'];

export interface RetentionFailure {
  readonly organizationId: string;
  readonly candidateId: string;
  readonly message: string;
}

export interface RetentionResult {
  /** The warnings no digest email carried yet, for the email digest. */
  readonly digests: readonly DigestEntry[];
  /** One summary per organization that had something to warn about or erase. */
  readonly runs: readonly RetentionRun[];
  readonly exportsDeleted: number;
  /** Candidates whose erasure failed: they are retried by the next run. For the worker's logs. */
  readonly failures: readonly RetentionFailure[];
  /** Erasures that committed but left stored files neither deleted nor queued (storage and queue down). For the worker's logs. */
  readonly orphanedFiles: readonly { readonly organizationId: string; readonly keys: readonly string[] }[];
}

const SYSTEM_ACTOR = { type: 'system', id: null, onBehalfOfUserId: null } as const;

async function warn(deps: RetentionDeps, contexts: (org: string) => OrganizationContext, applications: readonly Application[], now: Date): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const warned = new Map<string, Set<string>>();
  for (const application of applications) {
    const scope = contexts(application.organizationId);
    const recipients = (await scope.memberList()).filter((m) => m.roles.some((role) => RECIPIENT_ROLES.includes(role)));
    for (const member of recipients) {
      const stored = await deps.notifications.createIfAbsent(
        {
          id: deps.newId(),
          organizationId: application.organizationId,
          userId: member.userId,
          kind: 'retention_expiring',
          applicationId: application.id,
          jobId: application.jobId,
          taskId: null,
          payload: { retentionExpiresAt: application.retentionExpiresAt.toISOString() },
          createdAt: now,
          readAt: null,
        },
        `retention_expiring:${application.id}`,
      );
      if (stored) warned.set(application.organizationId, new Set([...(warned.get(application.organizationId) ?? []), application.id]));
    }
  }
  return warned;
}

/**
 * Decided again on the locked rows, inside the erasure: still expired, consent unchanged since the scan (a
 * reconfirmation keeps the person), and never someone who can be asked to reconfirm but was not asked yet.
 */
export const stillDue =
  (now: Date, consentStatus: Application['consentStatus']) =>
  (application: ErasableApplication): boolean =>
    application.retentionExpiresAt <= now && application.consentStatus === consentStatus && !neverAsked(application);

const neverAsked = (application: Pick<ErasableApplication, 'consentStatus' | 'canBeAsked' | 'reconfirmationSentAt'>): boolean =>
  application.consentStatus === 'to_renew' && application.canBeAsked && application.reconfirmationSentAt === null;

const addTo = (counts: Map<string, number>, organizationId: string, count: number): void => {
  if (count > 0) counts.set(organizationId, (counts.get(organizationId) ?? 0) + count);
};

async function eraseExpired(
  deps: RetentionDeps,
  expired: readonly Application[],
  now: Date,
): Promise<{ erased: Map<string, number>; failures: RetentionFailure[]; orphanedFiles: { organizationId: string; keys: readonly string[] }[] }> {
  const erased = new Map<string, number>();
  const failures: RetentionFailure[] = [];
  const orphanedFiles: { organizationId: string; keys: readonly string[] }[] = [];
  // Imported data nobody reconfirmed within IMPORT_RECONFIRM_DAYS goes with its own reason.
  for (const [, group] of groupBy(expired, (a) => `${a.organizationId}\u0000${a.candidateId}\u0000${a.consentStatus}`)) {
    const first = group[0];
    if (!first) continue;
    try {
      const result = await eraseCandidateData(deps, {
        organizationId: first.organizationId,
        candidateId: first.candidateId,
        applicationIds: group.map((a) => a.id),
        reason: first.consentStatus === 'to_renew' ? 'consent_not_renewed' : 'retention',
        actor: SYSTEM_ACTOR,
        onlyIf: stillDue(now, first.consentStatus),
      });
      addTo(erased, first.organizationId, result.applicationCount);
    } catch (error) {
      if (error instanceof FileCleanupError) {
        // The database erase committed: the people are gone and counted, so the next run must not retry them.
        addTo(erased, first.organizationId, error.result.applicationCount);
        orphanedFiles.push({ organizationId: first.organizationId, keys: error.keys });
        continue;
      }
      failures.push({ organizationId: first.organizationId, candidateId: first.candidateId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { erased, failures, orphanedFiles };
}

async function deleteExpiredExports(deps: RetentionDeps, now: Date): Promise<number> {
  const expired = await deps.dataExports.listExpiredAcrossOrganizations(now);
  let deleted = 0;
  for (const dataExport of expired) {
    const lost = await deleteFilesAfterErasure(deps, dataExport.organizationId, [dataExportKey(dataExport.organizationId, dataExport.id)]);
    // Neither deleted nor queued: keep the row so the next run tries again.
    if (lost.length > 0) continue;
    await deps.dataExports.delete(dataExport.organizationId, dataExport.id);
    deleted += 1;
  }
  return deleted;
}

/**
 * Daily system job (`retention.run`, 03:00). Applications that expire within RETENTION_WARNING_DAYS warn every owner
 * and admin once (a notification per application, deduped, and a digest entry). Applications already past their expiry
 * are erased, open ones included, through `eraseCandidateData` with reason `retention`; a candidate left with no
 * application goes too. One failing candidate does not stop the others. Also deletes organization exports past
 * their expiry. Stores one `retention_run` summary per organization that had something to do.
 */
interface Tally {
  readonly warned: Map<string, Set<string>>;
  readonly erased: Map<string, number>;
  readonly failures: RetentionFailure[];
  readonly orphanedFiles: { organizationId: string; keys: readonly string[] }[];
}

/** One page of the scan: warn the upcoming ones, erase the expired ones, add it all to the tally. */
async function processPage(deps: RetentionDeps, context: (organizationId: string) => OrganizationContext, page: readonly Application[], now: Date, tally: Tally): Promise<void> {
  // Imported applications always expire within the reconfirmation window: no warning, the email already asked.
  const upcoming = page.filter((a) => a.retentionExpiresAt > now && a.consentStatus === 'given');
  for (const [organizationId, ids] of await warn(deps, context, upcoming, now)) tally.warned.set(organizationId, new Set([...(tally.warned.get(organizationId) ?? []), ...ids]));
  const result = await eraseExpired(deps, page.filter((a) => a.retentionExpiresAt <= now), now);
  for (const [organizationId, count] of result.erased) addTo(tally.erased, organizationId, count);
  tally.failures.push(...result.failures);
  tally.orphanedFiles.push(...result.orphanedFiles);
}

/** Pages through every application expiring before the warning horizon. Erased rows sit behind the cursor: none is skipped. */
async function scan(deps: RetentionDeps, context: (organizationId: string) => OrganizationContext, now: Date, pageSize: number): Promise<Tally> {
  const tally: Tally = { warned: new Map(), erased: new Map(), failures: [], orphanedFiles: [] };
  const horizon = new Date(now.getTime() + RETENTION_WARNING_DAYS * DAY_MS);
  let after: { readonly retentionExpiresAt: Date; readonly id: string } | undefined;
  for (;;) {
    const page = await deps.applications.listRetentionExpiringAcrossOrganizations(horizon, { limit: pageSize, after });
    await processPage(deps, context, page, now, tally);
    const last = page.at(-1);
    if (!last || page.length < pageSize) return tally;
    after = { retentionExpiresAt: last.retentionExpiresAt, id: last.id };
  }
}

const inputSchema = z.object({ now: z.date(), pageSize: z.number().int().min(1).max(5000).default(RETENTION_PAGE) });

/**
 * Daily system job (`retention.run`, 03:00). Applications that expire within RETENTION_WARNING_DAYS warn every owner
 * and admin once (a notification per application, deduped, and a digest entry). Applications already past their expiry
 * are erased, open ones included, through `eraseCandidateData` with reason `retention`, re-checked under lock; a
 * candidate left with no application goes too. The scan is read in keyset pages, so memory stays flat. One failing
 * candidate does not stop the others. Also deletes organization exports past their expiry. Stores one `retention_run`
 * summary per organization that had something to do.
 */
export const runRetention = defineSystemJob<RetentionDeps, typeof inputSchema, RetentionResult>({
  name: 'runRetention',
  input: inputSchema,
  handler: async ({ deps, input }): Promise<RetentionResult> => {
    const { now } = input;
    const contexts = new Map<string, OrganizationContext>();
    const context = (organizationId: string): OrganizationContext => {
      const found = contexts.get(organizationId) ?? new OrganizationContext(deps, organizationId);
      contexts.set(organizationId, found);
      return found;
    };
    const { warned, erased, failures, orphanedFiles } = await scan(deps, context, now, input.pageSize);
    const runs: RetentionRun[] = [];
    for (const organizationId of new Set([...erased.keys(), ...warned.keys()])) {
      runs.push(
        await deps.retentionRuns.create({ id: deps.newId(), organizationId, startedAt: now, warned: warned.get(organizationId)?.size ?? 0, erased: erased.get(organizationId) ?? 0 }),
      );
    }
    return { digests: await unsentDigests(deps.notifications, context, RETENTION_DIGEST_KINDS, now), runs, exportsDeleted: await deleteExpiredExports(deps, now), failures, orphanedFiles };
  },
});
