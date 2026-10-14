import { z } from 'zod';

export const NOTIFICATION_KINDS = [
  'response_due_soon',
  'response_overdue',
  'task_assigned',
  'task_due',
  'job_close_blocked',
  'automation_failed',
  'retention_expiring',
  'job_stale',
  'job_request_submitted',
  'job_request_decided',
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

/**
 * At most one notification per (user, dedupe key): the hourly scan never repeats itself. The key holds the promise's
 * `responseDueAt`: an application that re-enters a stage gets a new promise, and with it new alerts.
 */
export const notificationDedupeKey = (kind: NotificationKind, applicationId: string, stageId: string, responseDueAt: Date | null): string =>
  `${kind}:${applicationId}:${stageId}:${responseDueAt === null ? 'none' : responseDueAt.toISOString()}`;

/** The kinds a digest email carries, by the scan that creates them. */
export const DEADLINE_DIGEST_KINDS = ['response_due_soon', 'response_overdue', 'task_due'] as const satisfies readonly NotificationKind[];
export const STALE_DIGEST_KINDS = ['job_stale'] as const satisfies readonly NotificationKind[];
export const RETENTION_DIGEST_KINDS = ['retention_expiring'] as const satisfies readonly NotificationKind[];

/** A notification not emailed within this many days is dropped from digests: the in-app one remains. */
export const DIGEST_MAX_AGE_DAYS = 3;
