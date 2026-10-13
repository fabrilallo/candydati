import { dataExportKey, RETENTION_WARNING_DAYS, type Application, type Notification, type RetentionRun } from '@tt/domain';
import { z } from 'zod';
import type { RetentionDeps } from '../../privacy-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { buildDigests, OrganizationContext, type DigestEntry } from '../automations/scan-deadlines.js';
import { deleteFilesAfterErasure, eraseCandidateData } from './erase-candidate-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECIPIENT_ROLES = ['owner', 'admin'];

export interface RetentionFailure {
  readonly organizationId: string;
  readonly candidateId: string;
  readonly message: string;
}

export interface RetentionResult {
  /** Only the warnings created by THIS run, for the email digest. */
  readonly digests: readonly DigestEntry[];
  /** One summary per organization that had something to warn about or erase. */
  readonly runs: readonly RetentionRun[];
  readonly exportsDeleted: number;
  /** Candidates whose erasure failed: they are retried by the next run. For the worker's logs. */
  readonly failures: readonly RetentionFailure[];
}

const SYSTEM_ACTOR = { type: 'system', id: null, onBehalfOfUserId: null } as const;

const groupBy = <T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, readonly T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
};

async function warn(deps: RetentionDeps, contexts: (org: string) => OrganizationContext, applications: readonly Application[], now: Date): Promise<readonly Notification[]> {
  const created: Notification[] = [];
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
      if (stored) created.push(stored);
    }
  }
  return created;
}

async function eraseExpired(deps: RetentionDeps, expired: readonly Application[]): Promise<{ erased: Map<string, number>; failures: RetentionFailure[] }> {
  const erased = new Map<string, number>();
  const failures: RetentionFailure[] = [];
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
      });
      erased.set(first.organizationId, (erased.get(first.organizationId) ?? 0) + result.applicationCount);
    } catch (error) {
      failures.push({ organizationId: first.organizationId, candidateId: first.candidateId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { erased, failures };
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
export const runRetention = defineSystemJob<RetentionDeps, z.ZodObject<{ now: z.ZodDate }>, RetentionResult>({
  name: 'runRetention',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }): Promise<RetentionResult> => {
    const { now } = input;
    const expiring = await deps.applications.listRetentionExpiringAcrossOrganizations(new Date(now.getTime() + RETENTION_WARNING_DAYS * DAY_MS));
    const expired = expiring.filter((a) => a.retentionExpiresAt <= now);
    // Imported applications always expire within the reconfirmation window: no warning, the email already asked.
    const upcoming = expiring.filter((a) => a.retentionExpiresAt > now && a.consentStatus === 'given');
    const contexts = new Map<string, OrganizationContext>();
    const context = (organizationId: string): OrganizationContext => {
      const found = contexts.get(organizationId) ?? new OrganizationContext(deps, organizationId);
      contexts.set(organizationId, found);
      return found;
    };
    const warnings = await warn(deps, context, upcoming, now);
    const { erased, failures } = await eraseExpired(deps, expired);
    const warnedByOrganization = new Map<string, Set<string>>();
    for (const w of warnings) warnedByOrganization.set(w.organizationId, new Set([...(warnedByOrganization.get(w.organizationId) ?? []), w.applicationId ?? '']));
    const organizations = new Set([...erased.keys(), ...warnedByOrganization.keys()]);
    const runs: RetentionRun[] = [];
    for (const organizationId of organizations) {
      runs.push(
        await deps.retentionRuns.create({
          id: deps.newId(),
          organizationId,
          startedAt: now,
          warned: warnedByOrganization.get(organizationId)?.size ?? 0,
          erased: erased.get(organizationId) ?? 0,
        }),
      );
    }
    return { digests: await buildDigests(context, warnings), runs, exportsDeleted: await deleteExpiredExports(deps, now), failures };
  },
});
