import { z } from 'zod';

export const TASK_TITLE_MAX = 200;
/** Tasks due within this many hours trigger `task_due`. */
export const TASK_DUE_SOON_HOURS = 24;

export interface Task {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string | null;
  readonly jobId: string | null;
  readonly title: string;
  /** A member of the organization. */
  readonly assigneeId: string;
  readonly dueAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(TASK_TITLE_MAX),
  assigneeId: z.string().min(1),
  applicationId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  dueAt: z.coerce.date().optional(),
});
export type TaskInput = z.input<typeof taskInputSchema>;
