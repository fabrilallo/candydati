import { loadRefs, toTaskDto, type TaskDeps, type TaskDto } from '@candydati/core';
import type { Task } from '@candydati/domain';

const UNKNOWN_MEMBER = 'Former member';

/** The list shape for a single task that a command just returned, so the client gets one DTO everywhere. */
export async function toTaskResponse(deps: TaskDeps, organizationId: string, task: Task): Promise<TaskDto> {
  const names = await deps.users.namesOf(organizationId, [task.assigneeId]);
  const refs = await loadRefs(deps, organizationId, [task.applicationId], [task.jobId]);
  return toTaskDto({
    task,
    assigneeName: names[task.assigneeId] ?? UNKNOWN_MEMBER,
    candidate: refs.candidateOf(task.applicationId),
    jobTitle: refs.jobTitleOf(task.jobId),
  });
}
