import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildTask, seedAutomationWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { completeTask, createTask, listApplicationTasks, listTasks, reopenTask } from './tasks.js';

const NOW = new Date('2026-06-01T10:00:00.000Z');
const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const world = (tasks = [buildTask()]) => seedAutomationWorld({ tasks });

describe('createTask', () => {
  it('creates a task about an application (job implied), notifies the assignee and audits without the title', async () => {
    const deps = world([]);
    const task = await createTask(deps, recruiter, { title: ' Call Ada ', assigneeId: 'user_test', applicationId: 'app_1', dueAt: '2026-06-03T00:00:00Z' });
    expect(task).toMatchObject({
      title: 'Call Ada',
      assigneeId: 'user_test',
      applicationId: 'app_1',
      jobId: 'job_1',
      createdBy: 'recruiter_1',
      createdAt: NOW,
      dueAt: new Date('2026-06-03T00:00:00Z'),
      completedAt: null,
    });
    expect(deps.notifications.snapshot()).toEqual([expect.objectContaining({ userId: 'user_test', kind: 'task_assigned', taskId: task.id, applicationId: 'app_1' })]);
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'task.created', target: { type: 'task', id: task.id } });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('Call Ada');
  });

  it('does not notify someone who assigns the task to themselves, and allows a job-only or free task', async () => {
    const deps = world([]);
    await createTask(deps, recruiter, { title: 'Mine', assigneeId: 'recruiter_1' });
    await createTask(deps, recruiter, { title: 'Job', assigneeId: 'user_test', jobId: 'job_1' });
    expect(deps.notifications.snapshot()).toHaveLength(1);
    expect(deps.tasks.snapshot().map((t) => [t.applicationId, t.jobId])).toEqual([[null, null], [null, 'job_1']]);
  });

  it('refuses an assignee who is not a member of the organization', async () => {
    const error = await createTask(world([]), recruiter, { title: 'x', assigneeId: 'stranger' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([{ path: 'assigneeId', message: 'not_a_member' }]);
  });

  it('refuses a job that does not match the application, and unknown application or job', async () => {
    const deps = world([]);
    await expect(createTask(deps, recruiter, { title: 'x', assigneeId: 'user_test', applicationId: 'app_1', jobId: 'other' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTask(deps, recruiter, { title: 'x', assigneeId: 'user_test', applicationId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createTask(deps, recruiter, { title: 'x', assigneeId: 'user_test', jobId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('needs task:manage and a valid title', async () => {
    await expect(createTask(world([]), userActor({ role: 'interviewer', organizationId: ORG_A }), { title: 'x', assigneeId: 'user_test' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTask(world([]), recruiter, { title: ' ', assigneeId: 'user_test' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTask(world([]), recruiter, { title: 'x'.repeat(201), assigneeId: 'user_test' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('cannot reach an application of another organization', async () => {
    await expect(createTask(world([]), userActor({ role: 'owner', organizationId: ORG_B }), { title: 'x', assigneeId: 'user_test', applicationId: 'app_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('completeTask and reopenTask', () => {
  it('completes, refuses a second completion, reopens, refuses reopening an open task', async () => {
    const deps = world();
    expect((await completeTask(deps, recruiter, { taskId: 'task_1' })).completedAt).toEqual(NOW);
    await expect(completeTask(deps, recruiter, { taskId: 'task_1' })).rejects.toBeInstanceOf(ConflictError);
    expect((await reopenTask(deps, recruiter, { taskId: 'task_1' })).completedAt).toBeNull();
    await expect(reopenTask(deps, recruiter, { taskId: 'task_1' })).rejects.toBeInstanceOf(ConflictError);
    expect(deps.auditLog.events().map((e) => e.action)).toEqual(['task.completed', 'task.reopened']);
  });

  it('is not found for a task of another organization and forbidden without task:manage', async () => {
    await expect(completeTask(world(), userActor({ role: 'owner', organizationId: ORG_B }), { taskId: 'task_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(completeTask(world(), userActor({ role: 'interviewer', organizationId: ORG_A }), { taskId: 'task_1' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listTasks and listApplicationTasks', () => {
  const many = () =>
    world([
      buildTask({ id: 't_late', dueAt: new Date('2026-06-09T00:00:00Z') }),
      buildTask({ id: 't_soon', dueAt: new Date('2026-06-02T00:00:00Z') }),
      buildTask({ id: 't_none', dueAt: null }),
      buildTask({ id: 't_done', completedAt: NOW }),
      buildTask({ id: 't_other', assigneeId: 'admin_1', applicationId: null }),
    ]);

  it('lists my open tasks by due date, no date last, with names and context', async () => {
    const views = await listTasks(many(), userActor({ id: 'user_test', role: 'interviewer', organizationId: ORG_A }), {});
    expect(views.map((v) => v.task.id)).toEqual(['t_soon', 't_late', 't_none']);
    expect(views[0]).toMatchObject({ assigneeName: 'Olivia Owner', candidate: { firstName: 'Ada' }, jobTitle: 'Backend Developer' });
  });

  it('can include completed and everyone`s tasks', async () => {
    const actor = userActor({ id: 'user_test', role: 'recruiter', organizationId: ORG_A });
    expect((await listTasks(many(), actor, { open: false })).map((v) => v.task.id)).toEqual(['t_soon', 't_late', 't_none', 't_done']);
    expect((await listTasks(many(), actor, { mine: false })).map((v) => v.task.id)).toContain('t_other');
  });

  it('shows "Former member" for an assignee who left', async () => {
    const [view] = await listTasks(world([buildTask({ assigneeId: 'gone' })]), userActor({ id: 'gone', organizationId: ORG_A }), {});
    expect(view?.assigneeName).toBe('Former member');
  });

  it('lists by application and never across organizations', async () => {
    const actor = userActor({ role: 'interviewer', organizationId: ORG_A });
    expect((await listApplicationTasks(many(), actor, { applicationId: 'app_1' })).map((v) => v.task.id)).toHaveLength(4);
    await expect(listApplicationTasks(many(), userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_1' })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listTasks(many(), userActor({ id: 'user_test', organizationId: ORG_B }), { mine: false })).toEqual([]);
  });
});
