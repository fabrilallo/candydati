import {
  DEADLINE_DIGEST_KINDS,
  DIGEST_MAX_AGE_DAYS,
  DUE_SOON_HOURS,
  HOUR_MS,
  needsEscalation,
  notificationDedupeKey,
  responseState,
  TASK_DUE_SOON_HOURS,
  isRole,
  type Job,
  type Notification,
  type NotificationKind,
} from '@tt/domain';
import { z } from 'zod';
import type { Member, NotificationRepository, ScanDeps } from '../../automation-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { createJobScopeContext, type JobScopeContext } from '../../access/job-scope.js';

export interface DigestEntry {
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  /** The notifications no digest email carried yet (this run's and any a crashed earlier run left behind). */
  readonly notifications: readonly Notification[];
  /** Titles of the jobs the notifications point to. */
  readonly jobTitles: Readonly<Record<string, string>>;
}

export interface DeadlineScanResult {
  readonly digests: readonly DigestEntry[];
  /** Deadline scan only: open promises found past due and flipped to `missed` by this run. */
  readonly missedPromises?: number;
}

const ESCALATION_ROLES = ['owner', 'admin'];

export class OrganizationContext {
  private members: Promise<readonly Member[]> | null = null;
  private readonly jobs = new Map<string, Promise<Job | null>>();
  private readonly scopes = new Map<string, JobScopeContext | null>();

  constructor(
    private readonly deps: Pick<ScanDeps, 'members' | 'jobs' | 'jobTeams'>,
    readonly organizationId: string,
  ) {}

  /**
   * The member can open the job today, by the same rule as every use case (`job-scope.ts`): owners, admins and
   * unrestricted recruiters reach every job, the others only the jobs of their teams. A null job id is not about a job.
   */
  async canReach(member: Member, jobId: string | null): Promise<boolean> {
    if (jobId === null) return true;
    let scope = this.scopes.get(member.userId);
    if (scope === undefined) {
      const role = member.roles.find(isRole);
      scope = role ? createJobScopeContext(this.deps.jobTeams, { type: 'user', id: member.userId, organizationId: this.organizationId, role, onBehalfOfUserId: null }) : null;
      this.scopes.set(member.userId, scope);
    }
    return scope !== null && scope.allowsJob(jobId);
  }

  memberList(): Promise<readonly Member[]> {
    this.members ??= this.deps.members.list(this.organizationId);
    return this.members;
  }

  job(jobId: string): Promise<Job | null> {
    let found = this.jobs.get(jobId);
    if (!found) {
      found = this.deps.jobs.findById(this.organizationId, jobId);
      this.jobs.set(jobId, found);
    }
    return found;
  }

  /**
   * The job owner if still a member who can reach the job (a hiring manager taken off the team cannot); otherwise
   * owners and admins, so a notification never goes nowhere.
   */
  async owners(job: Job): Promise<readonly Member[]> {
    const members = await this.memberList();
    const owner = members.find((m) => m.userId === job.createdBy);
    return owner && (await this.canReach(owner, job.id)) ? [owner] : this.escalation();
  }

  async escalation(): Promise<readonly Member[]> {
    return (await this.memberList()).filter((m) => m.roles.some((role) => ESCALATION_ROLES.includes(role)));
  }
}

/**
 * Hourly system job (`deadlines.scan`). For every open application due within 48 hours or overdue it notifies the job
 * owner; more than 2 days overdue it also notifies every owner and admin (escalation). Tasks due within 24 hours notify
 * their assignee. A notification exists once per (user, kind, application, stage), so running the scan again changes
 * nothing. Returns what is new per user, for the email digest the worker sends.
 */
export const scanDeadlines = defineSystemJob<ScanDeps, z.ZodObject<{ now: z.ZodDate }>, DeadlineScanResult>({
  name: 'scanDeadlines',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }): Promise<DeadlineScanResult> => {
    const { now } = input;
    // Past-due promises become `missed` here, once an hour; they stay unanswered until someone replies.
    const missedPromises = await deps.promises.markOverdueMissedAcrossOrganizations(now);
    const context = organizationContexts(deps);
    await notifyAwaitingResponses(deps, context, now);
    await notifyDueTasks(deps, now);
    return { digests: await unsentDigests(deps.notifications, context, DEADLINE_DIGEST_KINDS, now), missedPromises };
  },
});

/** One lazily built, cached context per organization for the duration of a scan. */
function organizationContexts(deps: ScanDeps): (organizationId: string) => OrganizationContext {
  const contexts = new Map<string, OrganizationContext>();
  return (organizationId) => {
    let found = contexts.get(organizationId);
    if (!found) {
      found = new OrganizationContext(deps, organizationId);
      contexts.set(organizationId, found);
    }
    return found;
  };
}

async function notifyAwaitingResponses(deps: ScanDeps, context: (organizationId: string) => OrganizationContext, now: Date): Promise<void> {
  const awaiting = await deps.applications.listAwaitingResponseAcrossOrganizations(new Date(now.getTime() + DUE_SOON_HOURS * HOUR_MS));
  for (const application of awaiting) {
    const scope = context(application.organizationId);
    const job = await scope.job(application.jobId);
    if (!job) continue;
    const state = responseState(application, job, now);
    if (state !== 'due_soon' && state !== 'overdue') continue;
    const kind: NotificationKind = state === 'overdue' ? 'response_overdue' : 'response_due_soon';
    const due = application.responseDueAt;
    const escalate = state === 'overdue' && due !== null && needsEscalation(due, now);
    const recipients = [...(await scope.owners(job)), ...(escalate ? await scope.escalation() : [])];
    for (const userId of new Set(recipients.map((m) => m.userId))) {
      await deps.notifications.createIfAbsent(
        {
          id: deps.newId(),
          organizationId: application.organizationId,
          userId,
          kind,
          applicationId: application.id,
          jobId: application.jobId,
          taskId: null,
          payload: { stageId: application.stageId, escalated: escalate && userId !== job.createdBy },
          createdAt: now,
          readAt: null,
        },
        notificationDedupeKey(kind, application.id, application.stageId, application.responseDueAt),
      );
    }
  }
}

async function notifyDueTasks(deps: ScanDeps, now: Date): Promise<void> {
  const tasks = await deps.tasks.listOpenDueAcrossOrganizations(new Date(now.getTime() + TASK_DUE_SOON_HOURS * HOUR_MS));
  for (const task of tasks) {
    await deps.notifications.createIfAbsent(
      {
        id: deps.newId(),
        organizationId: task.organizationId,
        userId: task.assigneeId,
        kind: 'task_due',
        applicationId: task.applicationId,
        jobId: task.jobId,
        taskId: task.id,
        payload: {},
        createdAt: now,
        readAt: null,
      },
      `task_due:${task.id}`,
    );
  }
}

/** The digests of notifications of `kinds` not yet emailed: built from what is stored, never from what this run inserted. */
export async function unsentDigests(
  notifications: Pick<NotificationRepository, 'listUnemailed'>,
  context: (organizationId: string) => OrganizationContext,
  kinds: readonly NotificationKind[],
  now: Date,
): Promise<readonly DigestEntry[]> {
  return buildDigests(context, await notifications.listUnemailed(kinds, new Date(now.getTime() - DIGEST_MAX_AGE_DAYS * 24 * HOUR_MS)));
}

/** Marks what a digest email carried, so the next run does not send it again. Call it after the send succeeded. */
export async function markDigestsEmailed(notifications: Pick<NotificationRepository, 'markEmailed'>, entries: readonly DigestEntry[], now: Date): Promise<void> {
  for (const entry of entries) await notifications.markEmailed(entry.organizationId, entry.notifications.map((n) => n.id), now);
}

/** The notifications whose job the member can still reach: a digest never names a job its reader cannot open. */
async function reachable(scope: OrganizationContext, member: Member, notifications: readonly Notification[]): Promise<readonly Notification[]> {
  const kept: Notification[] = [];
  for (const notification of notifications) if (await scope.canReach(member, notification.jobId)) kept.push(notification);
  return kept;
}

export async function buildDigests(
  context: (organizationId: string) => OrganizationContext,
  created: readonly Notification[],
): Promise<readonly DigestEntry[]> {
  const groups = new Map<string, Notification[]>();
  for (const notification of created) {
    const key = `${notification.organizationId}\u0000${notification.userId}`;
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  }
  const digests: DigestEntry[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const scope = context(first.organizationId);
    const member = (await scope.memberList()).find((m) => m.userId === first.userId);
    if (!member) continue;
    const notifications = await reachable(scope, member, group);
    if (notifications.length === 0) continue;
    const titles: Record<string, string> = {};
    for (const jobId of new Set(notifications.flatMap((n) => (n.jobId ? [n.jobId] : [])))) {
      const job = await scope.job(jobId);
      if (job) titles[jobId] = job.content.title;
    }
    digests.push({ organizationId: first.organizationId, userId: member.userId, email: member.email, name: member.name, notifications, jobTitles: titles });
  }
  return digests;
}
