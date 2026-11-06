import type { Application, Candidate, Job, Notification, NotificationKind, Task } from '@candydati/domain';
import type { TaskRepository } from '../../automation-ports.js';
import type { ApplicationRepository, CandidateRepository } from '../../candidate-ports.js';
import type { JobRepository } from '../../job-ports.js';
import type { DigestEntry } from '../automations/scan-deadlines.js';
import { stageName } from '../messaging/shared.js';

/** Where a digest reads the details of what it reports. Every read is scoped to the entry's organization. */
export interface DigestDetailSources {
  readonly applications: Pick<ApplicationRepository, 'findById'>;
  readonly candidates: Pick<CandidateRepository, 'findByIds'>;
  readonly tasks: Pick<TaskRepository, 'findById'>;
  readonly jobs: Pick<JobRepository, 'findById'>;
}

/**
 * One line of a digest, in facts. The candidate is named by first name and surname initial: enough for the reader to
 * recognise them, never a full name, contact or anything about the person beyond where they are in the process.
 */
export interface DigestItem {
  readonly kind: NotificationKind;
  readonly jobId: string | null;
  readonly candidate: string | null;
  readonly candidateId: string | null;
  readonly stage: string | null;
  readonly task: string | null;
  /** Promised answer, task deadline or end of retention, depending on the kind. */
  readonly dueAt: Date | null;
  readonly daysIdle: number | null;
}

interface Loaded {
  readonly applications: ReadonlyMap<string, Application>;
  readonly candidates: ReadonlyMap<string, Candidate>;
  readonly tasks: ReadonlyMap<string, Task>;
  readonly jobs: ReadonlyMap<string, Job>;
}

export const shortName = (candidate: Candidate): string => {
  const first = candidate.firstName.trim();
  const initial = candidate.lastName.trim().charAt(0).toUpperCase();
  return initial === '' ? first : `${first} ${initial}.`;
};

const unique = (values: readonly (string | null)[]): readonly string[] => [...new Set(values.filter((v): v is string => v !== null))];

async function loadEach<T>(ids: readonly string[], find: (id: string) => Promise<T | null>): Promise<ReadonlyMap<string, T>> {
  const found = await Promise.all(ids.map(async (id) => [id, await find(id)] as const));
  return new Map(found.filter((pair): pair is readonly [string, Awaited<T>] => pair[1] !== null));
}

async function load(sources: DigestDetailSources, organizationId: string, notifications: readonly Notification[]): Promise<Loaded> {
  const tasks = await loadEach(unique(notifications.map((n) => n.taskId)), (id) => sources.tasks.findById(organizationId, id));
  const applicationIds = unique([...notifications.map((n) => n.applicationId), ...[...tasks.values()].map((t) => t.applicationId)]);
  const applications = await loadEach(applicationIds, (id) => sources.applications.findById(organizationId, id));
  const candidateIds = unique([...applications.values()].map((a) => a.candidateId));
  const candidates = candidateIds.length === 0 ? [] : await sources.candidates.findByIds(organizationId, candidateIds);
  const jobs = await loadEach(unique(notifications.map((n) => n.jobId)), (id) => sources.jobs.findById(organizationId, id));
  return { applications, candidates: new Map(candidates.map((c) => [c.id, c])), tasks, jobs };
}

const dateOf = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function dueAtOf(notification: Notification, application: Application | undefined, task: Task | undefined): Date | null {
  switch (notification.kind) {
    case 'response_due_soon':
    case 'response_overdue':
      return application?.responseDueAt ?? null;
    case 'task_due':
    case 'task_assigned':
      return task?.dueAt ?? null;
    case 'retention_expiring':
      return dateOf(notification.payload.retentionExpiresAt) ?? application?.retentionExpiresAt ?? null;
    default:
      return null;
  }
}

function stageOf(notification: Notification, application: Application | undefined, job: Job | undefined): string | null {
  if (!job || notification.kind === 'retention_expiring' || notification.kind === 'task_due') return null;
  const fromPayload = notification.payload.stageId;
  const stageId = typeof fromPayload === 'string' ? fromPayload : application?.stageId;
  const name = stageId ? stageName(job, stageId) : '';
  return name === '' ? null : name;
}

function describe(notification: Notification, loaded: Loaded): DigestItem {
  const task = notification.taskId ? loaded.tasks.get(notification.taskId) : undefined;
  const applicationId = notification.applicationId ?? task?.applicationId ?? null;
  const application = applicationId ? loaded.applications.get(applicationId) : undefined;
  const candidate = application ? loaded.candidates.get(application.candidateId) : undefined;
  const job = notification.jobId ? loaded.jobs.get(notification.jobId) : undefined;
  const idle = notification.payload.daysIdle;
  return {
    kind: notification.kind,
    jobId: notification.jobId,
    candidate: candidate ? shortName(candidate) : null,
    candidateId: candidate?.id ?? null,
    stage: stageOf(notification, application, job),
    task: task?.title ?? null,
    dueAt: dueAtOf(notification, application, task),
    daysIdle: typeof idle === 'number' ? idle : null,
  };
}

/** The facts behind each notification of a digest, in the same order. A record that is gone leaves its fields null. */
export async function describeDigest(sources: DigestDetailSources, entry: DigestEntry): Promise<readonly DigestItem[]> {
  const notifications = entry.notifications.filter((n) => n.organizationId === entry.organizationId);
  const loaded = await load(sources, entry.organizationId, notifications);
  return entry.notifications.map((n) => (n.organizationId === entry.organizationId ? describe(n, loaded) : describe(n, EMPTY)));
}

const EMPTY: Loaded = { applications: new Map(), candidates: new Map(), tasks: new Map(), jobs: new Map() };
