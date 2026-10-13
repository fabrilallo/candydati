import { NOTIFICATION_KINDS, TASK_TITLE_MAX } from '@tt/domain'
import type { NotificationDto, TaskDto } from './phase4-contract'
import { calendarDays } from './response-countdown'

/** Pure: translation key of a notification's wording; kinds the web does not know read as a generic one. */
export const notificationKey = (kind: string): string => ((NOTIFICATION_KINDS as readonly string[]).includes(kind) ? `notifications.kinds.${kind}` : 'notifications.kinds.generic')

const TASK_KINDS: ReadonlySet<string> = new Set(['task_assigned', 'task_due'])
const stringOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/**
 * Pure: where a notification leads. Tasks go to "Le mie attività"; an application to its candidate when the api names
 * the candidate (`candidate`, or `payload.candidateId`), otherwise to the board of its job.
 */
export const notificationLink = (notification: NotificationDto): string | null => {
  if (TASK_KINDS.has(notification.kind) || (notification.taskId && !notification.applicationId)) return '/app/tasks'
  const candidateId = notification.candidate?.id ?? stringOf(notification.payload.candidateId)
  if (candidateId && notification.applicationId) return `/app/candidates/${encodeURIComponent(candidateId)}?application=${encodeURIComponent(notification.applicationId)}`
  const jobId = notification.jobId ?? stringOf(notification.payload.jobId)
  return jobId ? `/app/jobs/${encodeURIComponent(jobId)}/candidates` : null
}

/** Pure: the badge text for an unread count; past 99 it stops growing. */
export const unreadLabel = (count: number): string | null => (count <= 0 ? null : count > 99 ? '99+' : String(count))

export const TASK_GROUPS = ['overdue', 'today', 'upcoming', 'none'] as const
export type TaskGroup = (typeof TASK_GROUPS)[number]

/** Pure: in which group a task falls, by calendar day of its due date. */
export const taskGroup = (task: Pick<TaskDto, 'dueAt'>, now: Date, timeZone?: string): TaskGroup => {
  if (!task.dueAt) return 'none'
  const days = calendarDays(now, new Date(task.dueAt), timeZone)
  return days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming'
}

const byDue = (a: TaskDto, b: TaskDto): number => (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || a.createdAt.localeCompare(b.createdAt)

/** Pure: the tasks in their groups, earliest due first; empty groups are left out. */
export const groupTasks = (tasks: readonly TaskDto[], now: Date, timeZone?: string): readonly { readonly group: TaskGroup; readonly tasks: readonly TaskDto[] }[] =>
  TASK_GROUPS.map((group) => ({ group, tasks: tasks.filter((task) => taskGroup(task, now, timeZone) === group).toSorted(byDue) })).filter((entry) => entry.tasks.length > 0)

export interface TaskForm {
  readonly title: string
  readonly assigneeId: string
  /** `YYYY-MM-DD` from a date field, or empty. */
  readonly dueDate: string
}

export type TaskFormErrors = Partial<Record<keyof TaskForm, string>>

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
/** A due date means the end of the working day (18:00 local time). */
const DUE_HOUR = 18

/** Pure: the ISO instant of a due date picked in a date field, or null when empty or invalid. */
export const dueDateToIso = (value: string): string | null => {
  const match = DATE.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day, DUE_HOUR)
  return date.getMonth() === month - 1 && date.getDate() === day ? date.toISOString() : null
}

/** Pure: errors as translation keys, or the cleaned values to send. */
export const validateTaskForm = (form: TaskForm): { readonly errors: TaskFormErrors; readonly value: { title: string; assigneeId: string; dueAt: string | null } | null } => {
  const title = form.title.trim()
  const dueAt = form.dueDate === '' ? null : dueDateToIso(form.dueDate)
  const errors: TaskFormErrors = {
    ...(title === '' ? { title: 'tasks.errors.titleRequired' } : title.length > TASK_TITLE_MAX ? { title: 'tasks.errors.titleTooLong' } : {}),
    ...(form.assigneeId === '' ? { assigneeId: 'tasks.errors.assigneeRequired' } : {}),
    ...(form.dueDate !== '' && dueAt === null ? { dueDate: 'tasks.errors.dueInvalid' } : {}),
  }
  return Object.keys(errors).length > 0 ? { errors, value: null } : { errors, value: { title, assigneeId: form.assigneeId, dueAt } }
}

/** Pure: a task replaced by the version the api returned, in a new list. */
export const replaceTask = (tasks: readonly TaskDto[], fresh: TaskDto): readonly TaskDto[] => tasks.map((task) => (task.id === fresh.id ? fresh : task))
