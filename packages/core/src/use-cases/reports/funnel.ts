import { pipelineStagesOf, rate, STAGE_TYPES, type FunnelStageDto, type FunnelStageType, type Job } from '@candydati/domain';
import type { ReportAggregates } from '../../report-ports.js';

/** Stage id -> type for one job; `received` is its own type. Stages removed from the job are unknown. */
export function stageTypesOf(job: Job): ReadonlyMap<string, FunnelStageType> {
  return new Map(pipelineStagesOf(job.content.process).map((stage) => [stage.id, stage.declared?.type ?? 'received']));
}

const HIRED = '\u0000hired';
const pairKey = (from: string, to: string | null): string => `${from}\u0000${to ?? HIRED}`;

interface JobStage {
  readonly position: number;
  readonly stageId: string;
  readonly title: string | null;
  readonly type: FunnelStageType;
  /** Cohort: applications that entered the stage in the period. */
  readonly entered: number;
  /** Of the cohort, those that later entered the next stage of the job (or were hired, after the last one). */
  readonly advanced: number;
}

function stagesOfJob(job: Job, entries: ReadonlyMap<string, number>, advances: ReadonlyMap<string, number>): readonly JobStage[] {
  const stages = pipelineStagesOf(job.content.process);
  return stages.map((stage, position) => ({
    position,
    stageId: stage.id,
    title: stage.declared?.title ?? null,
    type: stage.declared?.type ?? 'received',
    entered: entries.get(stage.id) ?? 0,
    advanced: advances.get(pairKey(stage.id, stages[position + 1]?.id ?? null)) ?? 0,
  }));
}

const TYPE_ORDER: readonly FunnelStageType[] = ['received', ...STAGE_TYPES];

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

/**
 * Funnel of the period, a cohort measure: of the applications that entered a stage, how many went on to the next stage of
 * the same job (or were hired after the last one). It never exceeds 100%: an application that entered a later stage without
 * an event for the earlier one is not in the earlier cohort.
 * One job: its stages in declared order. Several jobs: aggregated by stage type (received first, then `STAGE_TYPES` order),
 * summing the cohorts job by job; types no job has do not appear.
 */
export function buildFunnel(
  jobs: readonly Job[],
  stageEntries: ReportAggregates['stageEntries'],
  stageAdvances: ReportAggregates['stageAdvances'],
  single: boolean,
): readonly FunnelStageDto[] {
  const entriesByJob = groupBy(stageEntries, (row) => row.jobId);
  const advancesByJob = groupBy(stageAdvances, (row) => row.jobId);
  const stages = jobs.map((job) =>
    stagesOfJob(
      job,
      new Map((entriesByJob.get(job.id) ?? []).map((row) => [row.stageId, row.entered])),
      new Map((advancesByJob.get(job.id) ?? []).map((row) => [pairKey(row.fromStageId, row.toStageId), row.count])),
    ),
  );
  if (single) {
    return (stages[0] ?? []).map((stage) => ({
      position: stage.position,
      stageId: stage.stageId,
      title: stage.title,
      type: stage.type,
      entered: stage.entered,
      conversionToNext: rate(stage.advanced, stage.entered),
    }));
  }
  const byType = groupBy(stages.flat(), (stage) => stage.type);
  return TYPE_ORDER.flatMap((type) => {
    const group = byType.get(type);
    if (!group) return [];
    const entered = group.reduce((sum, stage) => sum + stage.entered, 0);
    const advanced = group.reduce((sum, stage) => sum + stage.advanced, 0);
    return [{ position: null, stageId: null, title: null, type, entered, conversionToNext: rate(advanced, entered) }];
  });
}
