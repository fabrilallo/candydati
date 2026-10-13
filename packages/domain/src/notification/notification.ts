import { z } from 'zod';

export const NOTIFICATION_KINDS = [
  'response_due_soon',
  'response_overdue',
  'task_assigned',
  'task_due',
  'job_close_blocked',
  'automation_failed',
  'retention_expiring',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);

/** In-app notification. `payload` holds ids and counts only, never names or text of candidates. */
export interface Notification {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly kind: NotificationKind;
  readonly applicationId: string | null;
  readonly jobId: string | null;
  readonly taskId: string | null;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

/** At most one notification per (user, dedupe key): the hourly scan never repeats itself. */
export const notificationDedupeKey = (kind: NotificationKind, applicationId: string, stageId: string): string =>
  `${kind}:${applicationId}:${stageId}`;
