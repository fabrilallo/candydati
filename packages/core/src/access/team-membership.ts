import { teamRoleFor, type Job } from '@candydati/domain';
import type { Actor } from '../actor.js';
import type { CoreDeps } from '../ports.js';

/**
 * The person who creates a job (or the person an agent or API key acts for) joins its team, so a hiring manager keeps
 * seeing the ad they wrote. `others` are added too (the requester of a converted request). A role chosen earlier is kept.
 */
export async function addToJobTeam(deps: Pick<CoreDeps, 'jobTeams'>, actor: Actor, job: Job, now: Date, others: readonly { readonly userId: string; readonly role: ReturnType<typeof teamRoleFor> }[] = []): Promise<void> {
  if (!deps.jobTeams) return;
  const creator = actor.type === 'user' ? actor.id : actor.onBehalfOfUserId;
  const people = [...(creator === null ? [] : [{ userId: creator, role: teamRoleFor(actor.role) }]), ...others];
  for (const person of people) {
    await deps.jobTeams.addIfAbsent({ organizationId: job.organizationId, jobId: job.id, userId: person.userId, role: person.role, addedBy: 'system', createdAt: now });
  }
}
