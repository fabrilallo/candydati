import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../response/response-state.js';
import { automationTriggerSchema, isTimeBased, occurrenceOf, requiresCurrentStage, triggerDueNow, triggerOfOccurrence, type TriggerSubject } from './trigger.js';

const NOW = new Date('2026-06-10T12:00:00.000Z');
const job = { content: { responseDays: 5 } } as unknown as Parameters<typeof triggerDueNow>[2];
const subject = (overrides: Partial<TriggerSubject> = {}): TriggerSubject => ({
  outcome: null,
  stageChangedAt: new Date(NOW.getTime() - 3 * DAY_MS),
  responseDueAt: null,
  respondedAt: null,
  ...overrides,
});

describe('automationTriggerSchema', () => {
  it('accepts each trigger with its parameters and refuses unknown ones', () => {
    expect(automationTriggerSchema.parse({ type: 'stage_entered' })).toEqual({ type: 'stage_entered' });
    expect(automationTriggerSchema.parse({ type: 'stage_stuck', days: 7 })).toEqual({ type: 'stage_stuck', days: 7 });
    expect(automationTriggerSchema.parse({ type: 'candidate_replied' })).toEqual({ type: 'candidate_replied' });
    expect(automationTriggerSchema.parse({ type: 'feedback_submitted' })).toEqual({ type: 'feedback_submitted' });
    expect(automationTriggerSchema.parse({ type: 'response_due_soon', daysBefore: 1 })).toEqual({ type: 'response_due_soon', daysBefore: 1 });
    for (const bad of [{ type: 'stage_stuck', days: 0 }, { type: 'stage_stuck', days: 91 }, { type: 'response_due_soon', daysBefore: 15 }, { type: 'stage_entered', days: 1 }, { type: 'scored' }]) {
      expect(automationTriggerSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('tells time-based triggers apart and which ones need the application still in the stage', () => {
    expect(isTimeBased('stage_stuck')).toBe(true);
    expect(isTimeBased('response_due_soon')).toBe(true);
    expect(isTimeBased('stage_entered')).toBe(false);
    expect(requiresCurrentStage('feedback_submitted')).toBe(false);
    expect(requiresCurrentStage('candidate_replied')).toBe(true);
  });
});

describe('triggerDueNow', () => {
  it('stage_stuck: due once the application has been in the stage for the days of the rule', () => {
    expect(triggerDueNow({ type: 'stage_stuck', days: 3 }, subject(), job, NOW)).toBe(true);
    expect(triggerDueNow({ type: 'stage_stuck', days: 4 }, subject(), job, NOW)).toBe(false);
    expect(triggerDueNow({ type: 'stage_stuck', days: 3 }, subject({ outcome: 'hired' }), job, NOW)).toBe(false);
  });

  it('response_due_soon: due inside the window before the deadline, never once answered or past it', () => {
    const due = new Date(NOW.getTime() + 2 * DAY_MS);
    expect(triggerDueNow({ type: 'response_due_soon', daysBefore: 2 }, subject({ responseDueAt: due }), job, NOW)).toBe(true);
    expect(triggerDueNow({ type: 'response_due_soon', daysBefore: 1 }, subject({ responseDueAt: due }), job, NOW)).toBe(false);
    expect(triggerDueNow({ type: 'response_due_soon', daysBefore: 2 }, subject({ responseDueAt: due, respondedAt: NOW }), job, NOW)).toBe(false);
    expect(triggerDueNow({ type: 'response_due_soon', daysBefore: 2 }, subject({ responseDueAt: new Date(NOW.getTime() - 1) }), job, NOW)).toBe(false);
  });

  it('response_due_soon: falls back to the deadline the job declares', () => {
    // Entered 3 days ago, 5 response days: due in 2 days.
    expect(triggerDueNow({ type: 'response_due_soon', daysBefore: 2 }, subject(), job, NOW)).toBe(true);
    const silent = { content: {} } as unknown as typeof job;
    expect(triggerDueNow({ type: 'response_due_soon', daysBefore: 2 }, subject(), silent, NOW)).toBe(false);
  });

  it('event triggers are due whenever their event happens, if the application is open', () => {
    expect(triggerDueNow({ type: 'candidate_replied' }, subject(), job, NOW)).toBe(true);
    expect(triggerDueNow({ type: 'feedback_submitted' }, subject({ outcome: 'withdrawn' }), job, NOW)).toBe(false);
  });
});

describe('occurrenceOf', () => {
  it('names each occurrence so a trigger fires once per occurrence', () => {
    expect(occurrenceOf({ type: 'stage_entered' }, subject(), job, '')).toBe('');
    expect(occurrenceOf({ type: 'stage_stuck', days: 3 }, subject(), job, 'ignored')).toBe('stuck');
    const due = new Date('2026-06-12T00:00:00.000Z');
    expect(occurrenceOf({ type: 'response_due_soon', daysBefore: 2 }, subject({ responseDueAt: due }), job, '')).toBe('due:2026-06-12T00:00:00.000Z');
    expect(occurrenceOf({ type: 'candidate_replied' }, subject(), job, 'message:m1')).toBe('message:m1');
  });
});

describe('triggerOfOccurrence', () => {
  it('maps every recorded occurrence to its trigger', () => {
    expect(['', 'stuck', 'due:2026-06-01T00:00:00.000Z', 'message:m1', 'feedback:f1', 'weird'].map(triggerOfOccurrence)).toEqual([
      'stage_entered', 'stage_stuck', 'response_due_soon', 'candidate_replied', 'feedback_submitted', 'stage_entered',
    ]);
  });
});

describe('interview triggers', () => {
  it('belong to the stage of the interview and read back from their occurrence', () => {
    expect(requiresCurrentStage('interview_booked')).toBe(false);
    expect(requiresCurrentStage('interview_cancelled')).toBe(false);
    expect(requiresCurrentStage('candidate_replied')).toBe(true);
    expect(triggerOfOccurrence('interview:int_1')).toBe('interview_booked');
    expect(triggerOfOccurrence('interview-cancelled:int_1')).toBe('interview_cancelled');
    expect(automationTriggerSchema.safeParse({ type: 'interview_booked' }).success).toBe(true);
    expect(automationTriggerSchema.safeParse({ type: 'interview_booked', days: 1 }).success).toBe(false);
  });
});
