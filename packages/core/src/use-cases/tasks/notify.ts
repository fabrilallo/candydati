import type { Task } from '@candydati/domain';
import type { NotificationRepository } from '../../automation-ports.js';

/** `task_assigned` to the assignee, unless they gave the task to themselves. One per task. */
export async function notifyTaskAssigned(
  deps: { readonly notifications: NotificationRepository; readonly newId: () => string; readonly now: () => Date },
  task: Task,
): Promise<void> {
  if (task.assigneeId === task.createdBy) return;
  await deps.notifications.createIfAbsent(
    {
      id: deps.newId(),
      organizationId: task.organizationId,
      userId: task.assigneeId,
      kind: 'task_assigned',
      applicationId: task.applicationId,
      jobId: task.jobId,
      taskId: task.id,
      payload: {},
      createdAt: deps.now(),
      readAt: null,
    },
    `task_assigned:${task.id}`,
  );
}
