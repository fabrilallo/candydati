import { z } from 'zod';
import type { Job } from '../job/job.js';
import { computeResponseDueAt, DAY_MS, type ResponseTracked } from '../response/response-state.js';

/**
 * What starts a rule. Every rule belongs to one stage of the job, and every trigger is about an application in that stage:
 * it enters it, sits in it for N days, its candidate replies, an interviewer leaves feedback on it, or the response the
 * job promised is near. A trigger only starts an action (`send_template`, `create_task`): nothing ever moves or decides.
 */
export const AUTOMATION_TRIGGERS = ['stage_entered', 'stage_stuck', 'candidate_replied', 'feedback_submitted', 'response_due_soon'] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGERS)[number];

export const MAX_STUCK_DAYS = 90;
export const MAX_DUE_SOON_DAYS = 14;

export const automationTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage_entered') }).strict(),
  z.object({ type: z.literal('stage_stuck'), days: z.number().int().min(1).max(MAX_STUCK_DAYS) }).strict(),
  z.object({ type: z.literal('candidate_replied') }).strict(),
  z.object({ type: z.literal('feedback_submitted') }).strict(),
  z.object({ type: z.literal('response_due_soon'), daysBefore: z.number().int().min(1).max(MAX_DUE_SOON_DAYS) }).strict(),
]);
export type AutomationTrigger = z.output<typeof automationTriggerSchema>;

export const STAGE_ENTERED: AutomationTrigger = { type: 'stage_entered' };

/** Run by the worker's hourly scan, not by an event. */
export const TIME_BASED_TRIGGERS: readonly AutomationTriggerType[] = ['stage_stuck', 'response_due_soon'];
export const isTimeBased = (type: AutomationTriggerType): boolean => TIME_BASED_TRIGGERS.includes(type);

/**
 * Feedback is often written after the candidate moved on: it still belongs to the stage it was asked for. Every other
 * trigger is about the stage the application is in, and is skipped when it moved in the meantime.
 */
export const requiresCurrentStage = (type: AutomationTriggerType): boolean => type !== 'feedback_submitted';

export type TriggerSubject = ResponseTracked;

/** The deadline of the response the job promised for this stage entry, or null (answered, or no declared response time). */
function responseDeadline(subject: TriggerSubject, job: Pick<Job, 'content'>): Date | null {
  if (subject.respondedAt !== null) return null;
  return subject.responseDueAt ?? computeResponseDueAt(subject.stageChangedAt, job);
}

/** Pure: whether the trigger holds now for an application in the rule's stage. A decided application never triggers. */
export function triggerDueNow(trigger: AutomationTrigger, subject: TriggerSubject, job: Pick<Job, 'content'>, now: Date): boolean {
  if (subject.outcome !== null) return false;
  if (trigger.type === 'stage_stuck') return now.getTime() - subject.stageChangedAt.getTime() >= trigger.days * DAY_MS;
  if (trigger.type === 'response_due_soon') {
    const due = responseDeadline(subject, job);
    if (due === null) return false;
    const left = due.getTime() - now.getTime();
    return left >= 0 && left <= trigger.daysBefore * DAY_MS;
  }
  return true;
}

/**
 * Pure: the name of one occurrence, part of the execution key with the rule, the application and its stage entry, so a
 * trigger fires once per occurrence: once per entry (`''`), once per entry when stuck (`stuck`), once per deadline
 * (`due:<iso>`), once per message or feedback (the `event` its source names, such as `message:<id>`).
 */
export function occurrenceOf(trigger: AutomationTrigger, subject: TriggerSubject, job: Pick<Job, 'content'>, event: string): string {
  if (trigger.type === 'stage_entered') return '';
  if (trigger.type === 'stage_stuck') return 'stuck';
  if (trigger.type === 'response_due_soon') return `due:${responseDeadline(subject, job)?.toISOString() ?? ''}`;
  return event;
}

/** Pure: which trigger a recorded occurrence (`occurrenceOf`) belongs to. Unknown shapes read as the entry itself. */
export function triggerOfOccurrence(occurrence: string): AutomationTriggerType {
  if (occurrence === 'stuck') return 'stage_stuck';
  if (occurrence.startsWith('due:')) return 'response_due_soon';
  if (occurrence.startsWith('message:')) return 'candidate_replied';
  if (occurrence.startsWith('feedback:')) return 'feedback_submitted';
  return 'stage_entered';
}
