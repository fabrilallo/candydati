import { taskInputSchema, type Task } from '@candydati/domain';
import { z } from 'zod';
import { toActorUserId } from '../../actor-user.js';
import type { TaskDeps } from '../../automation-ports.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { requireApplication } from '../candidates/shared.js';
import { requireJob } from '../jobs/shared.js';
import { loadRefs, type CandidateRef } from '../refs.js';
import { notifyTaskAssigned } from './notify.js';
import { defineTaskUseCase } from './define.js';

export interface TaskView {
  readonly task: Task;
  readonly assigneeName: string;
  readonly candidate: CandidateRef | null;
  readonly jobTitle: string | null;
}

const UNKNOWN_MEMBER = 'Former member';
const TASK_LIST_MAX = 200;

async function toViews(deps: TaskDeps, organizationId: string, tasks: readonly Task[]): Promise<readonly TaskView[]> {
  const names = await deps.users.namesOf(organizationId, [...new Set(tasks.map((t) => t.assigneeId))]);
  const refs = await loadRefs(deps, organizationId, tasks.map((t) => t.applicationId), tasks.map((t) => t.jobId));
  return tasks.map((task) => ({
    task,
    assigneeName: names[task.assigneeId] ?? UNKNOWN_MEMBER,
    candidate: refs.candidateOf(task.applicationId),
    jobTitle: refs.jobTitleOf(task.jobId),
  }));
}

async function requireTask(deps: Pick<TaskDeps, 'tasks'>, organizationId: string, id: string): Promise<Task> {
  const task = await deps.tasks.findById(organizationId, id);
  if (!task) throw new NotFoundError('Task not found.');
  return task;
}

/** The assignee must be a member of this organization: a user of another one is never revealed or reachable. */
export async function assertMember(deps: Pick<TaskDeps, 'users'>, organizationId: string, userId: string): Promise<void> {
  const names = await deps.users.namesOf(organizationId, [userId]);
  if (!(userId in names)) throw new ValidationError([{ path: 'assigneeId', message: 'not_a_member' }]);
}

/** Create a task for a member, optionally about an application (its job is then implied). The assignee is notified. */
export const createTask = defineTaskUseCase({
  name: 'createTask',
  input: taskInputSchema,
  permission: 'task:manage',
  audit: {
    action: 'task.created',
    target: (_input, task: Task) => ({ type: 'task', id: task.id }),
    metadata: (_input, task: Task) => ({ assigneeId: task.assigneeId, applicationId: task.applicationId, jobId: task.jobId }),
  },
  handler: async ({ deps, actor, input }): Promise<Task> => {
    const { organizationId } = actor;
    await assertMember(deps, organizationId, input.assigneeId);
    const application = input.applicationId === undefined ? null : await requireApplication(deps, organizationId, input.applicationId);
    if (application && input.jobId !== undefined && input.jobId !== application.jobId) {
      throw new ValidationError([{ path: 'jobId', message: 'job_mismatch' }]);
    }
    const jobId = application?.jobId ?? input.jobId ?? null;
    if (jobId !== null) await requireJob(deps, organizationId, jobId);
    const now = deps.now();
    const createdBy = toActorUserId(actor);
    const task = await deps.tasks.create({
      id: deps.newId(),
      organizationId,
      applicationId: application?.id ?? null,
      jobId,
      title: input.title,
      assigneeId: input.assigneeId,
      dueAt: input.dueAt ?? null,
      createdBy,
      createdAt: now,
      completedAt: null,
    });
    await notifyTaskAssigned(deps, task);
    return task;
  },
});

const idInput = z.object({ taskId: z.string().min(1) });

export const completeTask = defineTaskUseCase({
  name: 'completeTask',
  input: idInput,
  permission: 'task:manage',
  audit: { action: 'task.completed', target: (_input, task: Task) => ({ type: 'task', id: task.id }) },
  handler: async ({ deps, actor, input }): Promise<Task> => {
    const task = await requireTask(deps, actor.organizationId, input.taskId);
    if (task.completedAt !== null) throw new ConflictError('The task is already completed.');
    return deps.tasks.save({ ...task, completedAt: deps.now() });
  },
});

export const reopenTask = defineTaskUseCase({
  name: 'reopenTask',
  input: idInput,
  permission: 'task:manage',
  audit: { action: 'task.reopened', target: (_input, task: Task) => ({ type: 'task', id: task.id }) },
  handler: async ({ deps, actor, input }): Promise<Task> => {
    const task = await requireTask(deps, actor.organizationId, input.taskId);
    if (task.completedAt === null) throw new ConflictError('The task is not completed.');
    return deps.tasks.save({ ...task, completedAt: null });
  },
});

/** `mine` (default): the actor's own tasks; otherwise every task of the organization. `open` (default): not completed. */
export const listTasks = defineTaskUseCase({
  name: 'listTasks',
  input: z.object({ mine: z.boolean().default(true), open: z.boolean().default(true) }),
  permission: 'task:read',
  audit: { skip: 'listing' },
  handler: async ({ deps, actor, input }): Promise<readonly TaskView[]> => {
    const tasks = await deps.tasks.list({
      organizationId: actor.organizationId,
      assigneeId: input.mine ? toActorUserId(actor) : undefined,
      openOnly: input.open,
      limit: TASK_LIST_MAX,
    });
    return toViews(deps, actor.organizationId, tasks);
  },
});

export const listApplicationTasks = defineTaskUseCase({
  name: 'listApplicationTasks',
  input: z.object({ applicationId: z.string().min(1) }),
  permission: 'task:read',
  audit: { skip: 'listing' },
  handler: async ({ deps, actor, input }): Promise<readonly TaskView[]> => {
    await requireApplication(deps, actor.organizationId, input.applicationId);
    return toViews(deps, actor.organizationId, await deps.tasks.listByApplication(actor.organizationId, input.applicationId));
  },
});
