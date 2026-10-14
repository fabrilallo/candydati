import type {
  AttentionState,
  AutomationAction,
  AutomationRule,
  NotificationKind,
  Task,
} from '@tt/domain';
import type { AttentionItemView, AttentionPage } from '../use-cases/candidates/list-attention.js';
import type { NotificationView } from '../use-cases/notifications/notifications.js';
import type { TaskView } from '../use-cases/tasks/tasks.js';

const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null): string | null => (date ? date.toISOString() : null);

export interface AttentionItemDto {
  readonly applicationId: string;
  readonly candidate: { readonly id: string; readonly firstName: string; readonly lastName: string };
  readonly job: { readonly id: string; readonly title: string };
  /** `null` when the stage has no readable name (it was removed). */
  readonly stage: { readonly id: string; readonly label: string | null };
  readonly responseDueAt: string;
  readonly state: AttentionState;
  readonly ownerName: string;
}

export interface NotificationDto {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly applicationId: string | null;
  readonly jobId: string | null;
  readonly taskId: string | null;
  /** Ids and counts only. */
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
  readonly candidate: { readonly id: string; readonly firstName: string; readonly lastName: string } | null;
  readonly jobTitle: string | null;
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface TaskDto {
  readonly id: string;
  readonly title: string;
  readonly applicationId: string | null;
  readonly jobId: string | null;
  readonly assignee: { readonly id: string; readonly name: string };
  readonly candidate: { readonly id: string; readonly firstName: string; readonly lastName: string } | null;
  readonly jobTitle: string | null;
  readonly dueAt: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface AutomationRuleDto {
  readonly id: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly action: AutomationAction;
  readonly enabled: boolean;
  readonly createdBy: string;
  readonly createdAt: string;
}

const toAttentionItemDto = (view: AttentionItemView): AttentionItemDto => ({
  applicationId: view.application.id,
  candidate: { id: view.candidate.id, firstName: view.candidate.firstName, lastName: view.candidate.lastName },
  job: { id: view.job.id, title: view.job.content.title },
  stage: { id: view.application.stageId, label: view.stageLabel },
  // An attention item always has a deadline: that is what puts it on the list.
  responseDueAt: iso(view.application.responseDueAt ?? view.application.stageChangedAt),
  state: view.state,
  ownerName: view.ownerName,
});

export const toAttentionItemDtos = (page: AttentionPage): readonly AttentionItemDto[] => page.items.map(toAttentionItemDto);

export const toNotificationDto = ({ notification, candidate, jobTitle }: NotificationView): NotificationDto => ({
  id: notification.id,
  kind: notification.kind,
  applicationId: notification.applicationId,
  jobId: notification.jobId,
  taskId: notification.taskId,
  payload: notification.payload,
  candidate,
  jobTitle,
  createdAt: iso(notification.createdAt),
  readAt: isoOrNull(notification.readAt),
});

const toTaskBase = (task: Task) => ({
  id: task.id,
  title: task.title,
  applicationId: task.applicationId,
  jobId: task.jobId,
  dueAt: isoOrNull(task.dueAt),
  createdBy: task.createdBy,
  createdAt: iso(task.createdAt),
  completedAt: isoOrNull(task.completedAt),
});

export const toTaskDto = ({ task, assigneeName, candidate, jobTitle }: TaskView): TaskDto => ({
  ...toTaskBase(task),
  assignee: { id: task.assigneeId, name: assigneeName },
  candidate,
  jobTitle,
});

export const toAutomationRuleDto = (rule: AutomationRule): AutomationRuleDto => ({
  id: rule.id,
  jobId: rule.jobId,
  stageId: rule.stageId,
  action: rule.action,
  enabled: rule.enabled,
  createdBy: rule.createdBy,
  createdAt: iso(rule.createdAt),
});
