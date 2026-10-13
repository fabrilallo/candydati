import {
  DUE_SOON_HOURS,
  HOUR_MS,
  needsEscalation,
  notificationDedupeKey,
  responseState,
  TASK_DUE_SOON_HOURS,
  type Job,
  type Notification,
  type NotificationKind,
} from '@tt/domain';
import { z } from 'zod';
import type { Member, ScanDeps } from '../../automation-ports.js';
import { defineSystemJob } from '../../use-case.js';

export interface DigestEntry {
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  /** Only the notifications created by THIS run. */
  readonly notifications: readonly Notification[];
  /** Titles of the jobs the notifications point to. */
  readonly jobTitles: Readonly<Record<string, string>>;
}

export interface DeadlineScanResult {
  readonly digests: readonly DigestEntry[];
}

const ESCALATION_ROLES = ['owner', 'admin'];

class OrganizationContext {
  private members: Promise<readonly Member[]> | null = null;
  private readonly jobs = new Map<string, Promise<Job | null>>();

  constructor(
    private readonly deps: ScanDeps,
    readonly organizationId: string,
  ) {}

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

  /** The job owner if still a member; otherwise owners and admins, so a notification never goes nowhere. */
  async owners(job: Job): Promise<readonly Member[]> {
    const members = await this.memberList();
    const owner = members.find((m) => m.userId === job.createdBy);
    return owner ? [owner] : this.escalation();
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
    const created: Notification[] = [];
    const contexts = new Map<string, OrganizationContext>();
    const context = (organizationId: string): OrganizationContext => {
      let found = contexts.get(organizationId);
      if (!found) {
        found = new OrganizationContext(deps, organizationId);
        contexts.set(organizationId, found);
      }
      return found;
    };
    const notify = async (notification: Notification, key: string): Promise<void> => {
      const stored = await deps.notifications.createIfAbsent(notification, key);
      if (stored) created.push(stored);
    };

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
        await notify(
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
          notificationDedupeKey(kind, application.id, application.stageId),
        );
      }
    }

    const tasks = await deps.tasks.listOpenDueAcrossOrganizations(new Date(now.getTime() + TASK_DUE_SOON_HOURS * HOUR_MS));
    for (const task of tasks) {
      await notify(
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
    return { digests: await buildDigests(context, created) };
  },
});

async function buildDigests(
  context: (organizationId: string) => OrganizationContext,
  created: readonly Notification[],
): Promise<readonly DigestEntry[]> {
  const groups = new Map<string, Notification[]>();
  for (const notification of created) {
    const key = `${notification.organizationId}\u0000${notification.userId}`;
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  }
  const digests: DigestEntry[] = [];
  for (const notifications of groups.values()) {
    const first = notifications[0];
    if (!first) continue;
    const scope = context(first.organizationId);
    const member = (await scope.memberList()).find((m) => m.userId === first.userId);
    if (!member) continue;
    const titles: Record<string, string> = {};
    for (const jobId of new Set(notifications.flatMap((n) => (n.jobId ? [n.jobId] : [])))) {
      const job = await scope.job(jobId);
      if (job) titles[jobId] = job.content.title;
    }
    digests.push({ organizationId: first.organizationId, userId: member.userId, email: member.email, name: member.name, notifications, jobTitles: titles });
  }
  return digests;
}
