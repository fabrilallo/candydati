import { STAGE_ID_PATTERN, type SelectionStage } from './content.js';

export class DuplicateStageIdError extends Error {
  constructor(readonly stageId: string) {
    super(`Duplicate stage id: ${stageId}`);
    this.name = 'DuplicateStageIdError';
  }
}

const MAX_ATTEMPTS = 20;

/** A selection stage that is guaranteed to carry its id (what the server stores and returns). */
export type IdentifiedStage = SelectionStage & { readonly id: string };

const freshId = (taken: ReadonlySet<string>, newId: () => string): string => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = newId();
    if (!STAGE_ID_PATTERN.test(candidate)) throw new Error(`Generated stage id is invalid: ${candidate}`);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Could not generate a unique stage id.');
};

/**
 * Keeps the ids the stages already have and gives a fresh unique one to each stage without it.
 * Pure: returns new stages. @throws DuplicateStageIdError when two stages already share an id.
 */
export function assignStageIds(process: readonly SelectionStage[], newId: () => string): IdentifiedStage[] {
  const taken = new Set<string>();
  for (const stage of process) {
    if (stage.id === undefined) continue;
    if (taken.has(stage.id)) throw new DuplicateStageIdError(stage.id);
    taken.add(stage.id);
  }
  return process.map((stage) => {
    if (stage.id !== undefined) return { ...stage, id: stage.id };
    const id = freshId(taken, newId);
    taken.add(id);
    return { ...stage, id };
  });
}
