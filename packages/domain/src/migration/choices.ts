import { z } from 'zod';
import { MAX_STAGES, STAGE_TITLE_MAX } from '../job/content.js';
import type { StageType } from '../job/taxonomy.js';
import { MIGRATION_STAGE_TARGETS, type MigrationIssueCode, type MigrationStageMapping, type MigrationStageMappingEntry } from './batch.js';
import { normaliseStageName } from './stage-mapping.js';

const ref = z.string().min(1).max(120);
const title = z.string().trim().min(1).max(STAGE_TITLE_MAX);

/** The operator's choice for one stage of one package job. */
export const migrationStageChoiceSchema = z.strictObject({ jobRef: ref, stageRef: ref, type: z.enum(MIGRATION_STAGE_TARGETS), title });
export type MigrationStageChoice = z.infer<typeof migrationStageChoiceSchema>;

/** The same choice for every stage, in every job, whose source name reads the same once normalised. `title` defaults to `name`. */
export const migrationStageNameChoiceSchema = z.strictObject({ name: title, type: z.enum(MIGRATION_STAGE_TARGETS), title: title.optional() });
export type MigrationStageNameChoice = z.infer<typeof migrationStageNameChoiceSchema>;

export interface MigrationStageChoices {
  readonly stages?: readonly MigrationStageChoice[] | undefined;
  readonly byName?: readonly MigrationStageNameChoice[] | undefined;
}

export interface MigrationChoiceIssue {
  readonly path: string;
  readonly message: string;
}

export type MigrationChoicesResult =
  | { readonly ok: true; readonly mapping: MigrationStageMapping }
  | { readonly ok: false; readonly issues: readonly MigrationChoiceIssue[] };

const stageKey = (entry: { readonly jobRef: string; readonly stageRef: string }): string => `${entry.jobRef}\u0000${entry.stageRef}`;

/**
 * The mapping with the operator's choices put in place: first the choices by source name (every job at once), then the
 * single-stage ones, which win. The source name of each stage never changes. A stage or a name the package does not
 * have is refused, with every such problem listed at once.
 */
export function applyStageChoices(current: MigrationStageMapping, choices: MigrationStageChoices): MigrationChoicesResult {
  const byName = choices.byName ?? [];
  const stages = choices.stages ?? [];
  const known = new Set(current.map(stageKey));
  const names = new Set(current.map((entry) => normaliseStageName(entry.sourceName)));
  const issues = [
    ...byName.filter((choice) => !names.has(normaliseStageName(choice.name))).map((choice) => ({ path: 'stageNames', message: `unknown_stage_name: ${choice.name}` })),
    ...stages.filter((choice) => !known.has(stageKey(choice))).map((choice) => ({ path: 'stageMapping', message: `unknown_stage: ${choice.jobRef}/${choice.stageRef}` })),
  ];
  if (issues.length > 0) return { ok: false, issues };
  const nameChoice = new Map(byName.map((choice) => [normaliseStageName(choice.name), { type: choice.type, title: choice.title ?? choice.name }] as const));
  const stageChoice = new Map(stages.map((choice) => [stageKey(choice), { type: choice.type, title: choice.title }] as const));
  const mapping = current.map((entry): MigrationStageMappingEntry => {
    const chosen = stageChoice.get(stageKey(entry)) ?? nameChoice.get(normaliseStageName(entry.sourceName));
    return chosen ? { ...entry, ...chosen } : entry;
  });
  return { ok: true, mapping };
}

/** One stage of the pipeline a migrated job gets: the package stages merged into it, in their order. */
export interface MigrationTargetStage {
  readonly type: StageType;
  readonly title: string;
  readonly stageRefs: readonly string[];
}

export interface MigrationJobPipeline {
  readonly jobRef: string;
  readonly stages: readonly MigrationTargetStage[];
  /** Package stages whose applications land in the job's first column (`received`). */
  readonly received: readonly string[];
  /** Package stages still mapped to `other`: the commit refuses while there are any. */
  readonly unmapped: readonly string[];
}

const mergeKey = (type: StageType, stageTitle: string): string => `${type}\u0000${normaliseStageName(stageTitle)}`;

function pipelineOf(jobRef: string, entries: readonly MigrationStageMappingEntry[]): MigrationJobPipeline {
  const merged = new Map<string, MigrationTargetStage>();
  const received: string[] = [];
  const unmapped: string[] = [];
  for (const entry of entries) {
    if (entry.type === 'received') received.push(entry.stageRef);
    else if (entry.type === 'other') unmapped.push(entry.stageRef);
    else {
      const key = mergeKey(entry.type, entry.title);
      const found = merged.get(key);
      merged.set(key, found ? { ...found, stageRefs: [...found.stageRefs, entry.stageRef] } : { type: entry.type, title: entry.title.trim(), stageRefs: [entry.stageRef] });
    }
  }
  return { jobRef, stages: [...merged.values()], received, unmapped };
}

/**
 * The pipeline of each package job: stages of the same job mapped to the same type and title (compared like stage names)
 * become ONE stage, titled like the first of them. Jobs come in the order of the mapping.
 */
export function migrationPipelines(mapping: MigrationStageMapping): readonly MigrationJobPipeline[] {
  const byJob = new Map<string, MigrationStageMappingEntry[]>();
  for (const entry of mapping) byJob.set(entry.jobRef, [...(byJob.get(entry.jobRef) ?? []), entry]);
  return [...byJob].map(([jobRef, entries]) => pipelineOf(jobRef, entries));
}

/** Issue codes the operator's choices resolve: the commit recomputes them from the choices instead of trusting stored issues. */
export const MIGRATION_CHOICE_CODES: readonly MigrationIssueCode[] = ['stage_unmapped', 'too_many_stages'];

export type MigrationCommitBlocker =
  | { readonly code: 'stages_unmapped'; readonly count: number }
  | { readonly code: 'too_many_stages'; readonly jobRefs: readonly string[] }
  | { readonly code: MigrationIssueCode };

export interface MigrationCommitCheck {
  readonly stageMapping: MigrationStageMapping;
  readonly excludedJobs: readonly string[];
  /** Codes of the error-level findings as they stand now (stored ones, and those checked again live). */
  readonly errors: readonly MigrationIssueCode[];
}

/**
 * Why the commit cannot start, recomputed from the choices: stages of included jobs still mapped to `other`, jobs with
 * more distinct stages than a pipeline holds once merged, and every error the choices cannot fix. Empty: it can start.
 */
export function migrationCommitBlockers({ stageMapping, excludedJobs, errors }: MigrationCommitCheck): readonly MigrationCommitBlocker[] {
  const excluded = new Set(excludedJobs);
  const pipelines = migrationPipelines(stageMapping.filter((entry) => !excluded.has(entry.jobRef)));
  const unmapped = pipelines.reduce((sum, pipeline) => sum + pipeline.unmapped.length, 0);
  const crowded = pipelines.filter((pipeline) => pipeline.stages.length > MAX_STAGES).map((pipeline) => pipeline.jobRef);
  const unfixable = [...new Set(errors.filter((code) => !MIGRATION_CHOICE_CODES.includes(code)))];
  return [
    ...(unmapped > 0 ? [{ code: 'stages_unmapped' as const, count: unmapped }] : []),
    ...(crowded.length > 0 ? [{ code: 'too_many_stages' as const, jobRefs: crowded }] : []),
    ...unfixable.map((code) => ({ code })),
  ];
}
