import { RECEIVED_STAGE_ID } from '@candydati/domain';
import type { DemoJobSpec } from '../content/types.js';
import { generatePeople, type DemoPerson } from '../content/people.js';
import type { DemoContext } from '../dataset.js';
import { demoId } from '../ids.js';
import { seededRandom } from '../random.js';
import { daysBefore } from '../time.js';
import { jobIdOf } from './jobs.js';
import { applicantTimeline, type Timeline } from './timeline.js';

/** One application of the demo, with the person behind it and what happened to it. */
export interface Applicant {
  readonly index: number;
  readonly spec: DemoJobSpec;
  readonly jobId: string;
  readonly applicationId: string;
  readonly candidateId: string;
  readonly person: DemoPerson;
  readonly timeline: Timeline;
}

const SEED = 20_261_104;
/** Every n-th open application is past its response deadline, so the attention list has something to show. */
const OVERDUE_EVERY = 5;

const stageIdsOf = (spec: DemoJobSpec): readonly string[] => [RECEIVED_STAGE_ID, ...spec.content.process.map((stage) => stage.id)];

const slotsOf = (spec: DemoJobSpec) => spec.pipeline.flatMap((slot) => Array.from({ length: slot.count }, () => ({ stage: slot.stage, outcome: slot.outcome ?? null })));

const lagFor = (spec: DemoJobSpec, open: boolean, openIndex: number, random: () => number): number => {
  if (!open) return 0.5 + random() * 5;
  if (openIndex % OVERDUE_EVERY === OVERDUE_EVERY - 1) return (spec.content.responseDays ?? 5) + 1.5;
  return 0.2 + random() * 3;
};

/**
 * The applications of every job: people assigned in order, a timeline per application counted back from now (or from
 * the job's closing). Deterministic: the same seed gives the same demo.
 */
export function planApplicants(ctx: DemoContext, specs: readonly DemoJobSpec[]): readonly Applicant[] {
  const random = seededRandom(SEED);
  const slots = specs.flatMap((spec) => slotsOf(spec).map((slot) => ({ spec, ...slot })));
  const people = generatePeople(slots.length, random);
  return slots.map((slot, index) => {
    const { spec } = slot;
    const openBefore = slots.slice(0, index).filter((other) => other.outcome === null).length;
    const lagDays = lagFor(spec, slot.outcome === null, openBefore, random);
    const person = people[index] as DemoPerson;
    const key = `${spec.key}:${index}`;
    const timeline = applicantTimeline({
      stageIds: stageIdsOf(spec),
      stage: slot.stage,
      outcome: slot.outcome,
      openedAt: daysBefore(ctx.now, spec.publishedDaysAgo ?? 0),
      endedAt: spec.closedDaysAgo === undefined ? ctx.now : daysBefore(ctx.now, spec.closedDaysAgo),
      lagDays,
      gapDays: 2 + random() * 3,
    });
    return {
      index,
      spec,
      jobId: jobIdOf(ctx, spec),
      applicationId: demoId(ctx.organizationId, `application:${key}`),
      candidateId: demoId(ctx.organizationId, `candidate:${person.email}`),
      person,
      timeline,
    };
  });
}

/** The declared stage an entry refers to (null for `received`). */
export const declaredStage = (spec: DemoJobSpec, stageId: string) => spec.content.process.find((stage) => stage.id === stageId) ?? null;
