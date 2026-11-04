import { DAY_MS, RECEIVED_STAGE_ID, type Outcome } from '@candydati/domain';
import { daysAfter, daysBefore } from '../time.js';

export interface StageEntry {
  readonly stageId: string;
  readonly at: Date;
}

export interface Timeline {
  /** `received` first, then every declared stage up to the current one, in order. */
  readonly entries: readonly StageEntry[];
  readonly outcome: Outcome | null;
  readonly decidedAt: Date | null;
}

export interface TimelineInput {
  /** `received` and the declared stage ids, in order. */
  readonly stageIds: readonly string[];
  /** The stage the application is at (or was decided at). */
  readonly stage: string;
  readonly outcome: Outcome | null;
  /** The ad's publication: nothing happens before it. */
  readonly openedAt: Date;
  /** Now, or the job's closing: nothing happens after it. */
  readonly endedAt: Date;
  /** Days between the last event and `endedAt`. */
  readonly lagDays: number;
  /** Days between two stage entries, at most. */
  readonly gapDays: number;
}

const MARGIN_DAYS = 0.2;

/**
 * When an application entered each stage and when it was decided, counted back from the end: the last event is
 * `lagDays` before `endedAt`, the earlier ones `gapDays` apart, squeezed so the first one is after the publication.
 */
export function applicantTimeline(input: TimelineInput): Timeline {
  const index = input.stageIds.indexOf(input.stage);
  if (index < 0 || input.stageIds[0] !== RECEIVED_STAGE_ID) throw new Error(`Unknown stage ${input.stage}`);
  const stages = input.stageIds.slice(0, index + 1);
  const lastEvent = daysBefore(input.endedAt, input.lagDays);
  const steps = stages.length - 1 + (input.outcome === null ? 0 : 1);
  const available = (lastEvent.getTime() - input.openedAt.getTime()) / DAY_MS - MARGIN_DAYS;
  if (available <= 0) throw new Error('No time between the publication and the last event');
  const gap = steps === 0 ? 0 : Math.min(input.gapDays, available / steps);
  const lastEntry = input.outcome === null ? lastEvent : daysBefore(lastEvent, gap);
  const entries = stages.map((stageId, position) => ({ stageId, at: daysBefore(lastEntry, (stages.length - 1 - position) * gap) }));
  return { entries, outcome: input.outcome, decidedAt: input.outcome === null ? null : lastEvent };
}

/** The moment the application left an entry: the next entry, the decision, or null while it is still there. */
export const leftAt = (timeline: Timeline, position: number): Date | null => timeline.entries[position + 1]?.at ?? timeline.decidedAt;

/** A moment shortly before `date`, for things done just before the next step (feedback, notes). */
export const shortlyBefore = (date: Date, fraction = 0.3): Date => daysBefore(date, fraction);
export const shortlyAfter = (date: Date, fraction = 0.2): Date => daysAfter(date, fraction);
