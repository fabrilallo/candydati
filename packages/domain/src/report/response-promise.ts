import type { ActorType } from '../audit/events.js';

/** One passage of an application through the pipeline: entering a stage (`toStageId`) or being decided (`outcome`). */
export interface StageEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly jobId: string;
  /** null on intake. */
  readonly fromStageId: string | null;
  /** null when the application is decided. */
  readonly toStageId: string | null;
  readonly outcome: 'hired' | 'not_selected' | 'withdrawn' | null;
  readonly occurredAt: Date;
  readonly actorType: ActorType;
  /** True for rows rebuilt by the migration from the audit log and the current rows. */
  readonly backfilled: boolean;
}

export const PROMISE_STATUSES = ['open', 'kept', 'missed'] as const;
export type PromiseStatus = (typeof PROMISE_STATUSES)[number];

/**
 * "We answer within N days", opened when an application enters a stage of a job that declares `responseDays`. `kept`: a person
 * answered at or before `dueAt`. `missed`: the answer came later, or the scan found it past due (then `respondedAt` stays
 * null until someone answers).
 */
export interface ResponsePromise {
  readonly id: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly startedAt: Date;
  readonly dueAt: Date;
  readonly respondedAt: Date | null;
  readonly status: PromiseStatus;
  /** Rebuilt by the migration, best effort. */
  readonly backfilled: boolean;
}

/** Status of a promise answered at `respondedAt`. */
export const statusWhenAnswered = (dueAt: Date, respondedAt: Date): PromiseStatus => (respondedAt <= dueAt ? 'kept' : 'missed');
