import { STAGE_TYPE_LABELS } from '../job/stage-labels.js';
import { STAGE_TYPES, type StageType } from '../job/taxonomy.js';
import type { MigrationStageMapping } from './batch.js';
import type { MigrationJob } from './package.js';

/** Lowercase, no accents, words separated by single spaces. */
const normalise = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The labels the product itself uses for each type, in every language. */
const LABELS: ReadonlyMap<string, StageType> = new Map(
  Object.values(STAGE_TYPE_LABELS).flatMap((labels) => STAGE_TYPES.map((type) => [normalise(labels[type]), type] as const)),
);

/**
 * Words other ATSs use for stage names (Italian and English), most specific first: "Final technical round" is a final
 * interview, "Technical assignment" a take-home one. Matched as whole words.
 */
const SYNONYMS: readonly (readonly [StageType, readonly string[]])[] = [
  ['offer', ['offer', 'offerta', 'proposta', 'contract', 'contratto']],
  ['final_interview', ['final', 'finale', 'last round', 'ultimo colloquio']],
  ['take_home_assignment', ['take home', 'homework', 'assignment', 'compito', 'test a casa', 'coding challenge', 'challenge']],
  ['live_exercise', ['live coding', 'live exercise', 'pair programming', 'whiteboard', 'esercizio dal vivo', 'prova pratica']],
  ['case_study', ['case study', 'business case', 'caso di studio', 'caso studio']],
  ['technical_interview', ['technical', 'tech', 'tecnico', 'tecnica', 'coding']],
  ['manager_interview', ['manager', 'responsabile', 'direttore', 'director']],
  ['team_interview', ['team', 'culture', 'cultural', 'culturale', 'squadra', 'peer']],
  ['hr_interview', ['hr', 'human resources', 'risorse umane', 'people', 'recruiter', 'colloquio conoscitivo']],
  ['screening_call', ['screening', 'screen', 'phone', 'call', 'chiamata', 'telefonata', 'telefonico', 'preselezione', 'pre selezione', 'intro']],
];

/** The stage type a source stage name stands for, or null when nothing fits. Never guesses from a partial word. */
export function stageTypeFromName(name: string): StageType | null {
  const text = normalise(name);
  const exact = LABELS.get(text);
  if (exact !== undefined) return exact;
  const padded = ` ${text} `;
  return SYNONYMS.find(([, words]) => words.some((word) => padded.includes(` ${word} `)))?.[0] ?? null;
}

/**
 * Where each package stage lands: its declared `type` when the package has one, else the type its name stands for, else
 * `other` for the operator to choose. The title is always the source's own name, so nothing the company wrote is lost.
 */
export function proposeStageMapping(jobs: readonly Pick<MigrationJob, 'ref' | 'stages'>[]): MigrationStageMapping {
  return jobs.flatMap((job) =>
    job.stages.map((stage) => ({
      jobRef: job.ref,
      stageRef: stage.ref,
      type: stage.type ?? stageTypeFromName(stage.name) ?? 'other',
      title: stage.name,
    })),
  );
}
