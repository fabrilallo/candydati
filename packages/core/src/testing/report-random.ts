import { DAY_MS, type Outcome } from '@tt/domain';
import { buildApplication, buildCandidate } from './candidate-fixtures.js';
import { buildJob, completeJobContent } from './job-fixtures.js';
import type { DatasetRepositories } from './report-dataset.js';

/** Small deterministic generator (mulberry32): the property tests must fail the same way every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = DAY_MS;
const START = Date.UTC(2026, 4, 15);
/** Window in which events happen: it straddles the June report period on both sides. */
const SPAN_DAYS = 60;
const OUTCOME_LIST: readonly Outcome[] = ['hired', 'not_selected', 'withdrawn'];

/**
 * Two jobs (3 and 2 declared stages) with applications whose events are random: entries in any order, stages skipped or
 * repeated, several jobs mixed, decisions anywhere, some applications with no `received` event (imports).
 */
export async function seedRandomEvents(repos: DatasetRepositories, organizationId: string, tag: string, seed: number, applications: number): Promise<readonly string[]> {
  const random = seededRandom(seed);
  const pick = (n: number): number => Math.floor(random() * n);
  const jobSpecs = [
    { id: `${tag}-rj1`, stages: ['hr_interview', 'technical_interview', 'offer'] as const },
    { id: `${tag}-rj2`, stages: ['screening_call', 'offer'] as const },
  ];
  for (const spec of jobSpecs) {
    await repos.jobs.create(
      buildJob({
        id: spec.id, organizationId, slug: spec.id, status: 'published', publishedAt: new Date(START),
        content: completeJobContent({ title: spec.id, process: spec.stages.map((type) => ({ type, durationMinutes: 30, conductedBy: 'recruiter' as const })) }),
      }),
    );
  }
  for (let index = 0; index < applications; index += 1) {
    const spec = jobSpecs[pick(jobSpecs.length)] as (typeof jobSpecs)[number];
    const id = `${tag}-ra${index}`;
    const candidateId = `${tag}-rc${index}`;
    await repos.candidates.create(buildCandidate({ id: candidateId, organizationId, email: `${tag}.${index}@example.org` }));
    await repos.applications.create(buildApplication({ id, organizationId, jobId: spec.id, candidateId, stageId: 'received', createdAt: new Date(START) }));
    const stageIds = ['received', ...spec.stages.map((_, i) => `stage-${i}`)];
    const steps = 1 + pick(5);
    let previous: string | null = null;
    for (let step = 0; step < steps; step += 1) {
      const stageId = stageIds[pick(stageIds.length)] as string;
      await repos.stageEvents.record({
        id: `${id}-e${step}`, organizationId, applicationId: id, jobId: spec.id, fromStageId: previous, toStageId: stageId, outcome: null,
        occurredAt: new Date(START + pick(SPAN_DAYS * 24) * DAY / 24), actorType: 'user', backfilled: false,
      });
      previous = stageId;
    }
    if (random() < 0.5) {
      await repos.stageEvents.record({
        id: `${id}-d`, organizationId, applicationId: id, jobId: spec.id, fromStageId: previous, toStageId: null, outcome: OUTCOME_LIST[pick(OUTCOME_LIST.length)] as Outcome,
        occurredAt: new Date(START + pick(SPAN_DAYS * 24) * DAY / 24), actorType: 'user', backfilled: false,
      });
    }
  }
  return jobSpecs.map((spec) => spec.id);
}
