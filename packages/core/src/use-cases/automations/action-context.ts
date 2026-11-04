import { isRole, roleHasPermission, type Application, type AutomationRule, type Job, type Role } from '@candydati/domain';
import { resolveJobScope } from '../../access/job-scope.js';
import type { SystemActor } from '../../actor.js';
import type { AutomationRunDeps, Member } from '../../automation-ports.js';

/** What one action runs with: the rule, its creator's current role, and the application it acts for. */
export interface ActionContext {
  readonly rule: AutomationRule;
  readonly role: Role;
  readonly job: Job;
  readonly application: Application;
  /** The occurrence of the trigger (`occurrenceOf`): part of every dedupe key, so a run acts once. */
  readonly occurrence: string;
}

/** Messages and requests go out in the name of the person who configured the rule, with their CURRENT role. */
export const ruleActor = (rule: AutomationRule, role: Role): SystemActor => ({
  type: 'system',
  id: rule.createdBy,
  onBehalfOfUserId: null,
  organizationId: rule.organizationId,
  role,
});

/** Whether `member`, with `role`, can open the job today (the rule that per-job access applies to every use case). */
export async function reachesJob(deps: Pick<AutomationRunDeps, 'jobTeams'>, organizationId: string, userId: string, role: Role, jobId: string): Promise<boolean> {
  const scope = await resolveJobScope(deps.jobTeams, { type: 'user', id: userId, onBehalfOfUserId: null, organizationId, role });
  return scope.kind === 'organization' || scope.jobIds.includes(jobId);
}

/** The first role of a member that reaches the job, or null. */
export async function reachingRole(deps: Pick<AutomationRunDeps, 'jobTeams'>, organizationId: string, member: Member, jobId: string): Promise<Role | null> {
  for (const role of member.roles.filter(isRole)) {
    if (await reachesJob(deps, organizationId, member.userId, role, jobId)) return role;
  }
  return null;
}

/** A role of `member` that holds `permission` and still reaches the job, or null. */
export async function allowedRole(
  deps: Pick<AutomationRunDeps, 'jobTeams'>,
  organizationId: string,
  member: Member | undefined,
  permission: Parameters<typeof roleHasPermission>[1],
  jobId: string,
): Promise<Role | null> {
  for (const role of member?.roles.filter(isRole) ?? []) {
    if (roleHasPermission(role, permission) && member && (await reachesJob(deps, organizationId, member.userId, role, jobId))) return role;
  }
  return null;
}

/** The ids a dedupe key carries for one run: the rule, the application, the stage entry and the occurrence. */
export const runKey = ({ rule, application, occurrence }: ActionContext): string =>
  `${rule.id}:${application.id}:${rule.stageId}:${application.stageChangedAt.toISOString()}${occurrence === '' ? '' : `:${occurrence}`}`;
