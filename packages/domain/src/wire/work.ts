import { z } from 'zod';
import { notificationKindSchema } from '../notification/notification.js';
import { ATTENTION_STATES } from '../response/response-state.js';
import { candidateRefSchema, isoDate, personRefSchema } from './common.js';

/** One row of "Da gestire" (`GET /applications/attention`). `stage.label` is null when the stage was removed. */
export const attentionItemSchema = z.object({
  applicationId: z.string(),
  candidate: candidateRefSchema,
  job: z.object({ id: z.string(), title: z.string() }),
  stage: z.object({ id: z.string(), label: z.string().nullable() }),
  responseDueAt: isoDate,
  state: z.enum(ATTENTION_STATES),
  ownerName: z.string(),
});
export type AttentionItemDto = z.infer<typeof attentionItemSchema>;

/** An in-app notification, with the candidate and job title resolved by the use case. `payload` holds ids and counts only. */
export const notificationSchema = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  applicationId: z.string().nullable(),
  jobId: z.string().nullable(),
  taskId: z.string().nullable(),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  candidate: candidateRefSchema.nullable(),
  jobTitle: z.string().nullable(),
  createdAt: isoDate,
  readAt: isoDate.nullable(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

/** `GET /notifications/unread-count`. */
export const unreadCountSchema = z.object({ count: z.number().int().nonnegative() });

/** A task (lists and the answers of create, complete, reopen). `createdBy` is a user id: the api sends no name for it. */
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  applicationId: z.string().nullable(),
  jobId: z.string().nullable(),
  assignee: personRefSchema.extend({ name: z.string() }),
  candidate: candidateRefSchema.nullable(),
  jobTitle: z.string().nullable(),
  dueAt: isoDate.nullable(),
  createdBy: z.string(),
  createdAt: isoDate,
  completedAt: isoDate.nullable(),
});
export type TaskDto = z.infer<typeof taskSchema>;

/** `POST /applications/decide`. */
export const decidedSchema = z.object({ decided: z.number().int().nonnegative() });

/** Message prefix of the validation issue `closeJob` answers with while applications are open: `open_applications:<count>`. */
export const OPEN_APPLICATIONS_PREFIX = 'open_applications:';
