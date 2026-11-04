/**
 * The cases of the assistant eval. To add one: append an object to `cases-core.ts` (the original adversarial set) or
 * `cases-principles.ts` (principles, privacy, injection, criteria, job drafts), see docs/ASSISTANT-EVAL.md.
 */
import { buildCoreCases } from './cases-core.js';
import { buildPrincipleCases } from './cases-principles.js';
import type { EvalCase } from './case-types.js';
import type { AgentWorld } from './seed.js';

export type { CaseChecks, EvalCase, HistoryTurn } from './case-types.js';

export const buildCases = (w: AgentWorld): readonly EvalCase[] => {
  const cases = [...buildCoreCases(w), ...buildPrincipleCases(w)];
  const ids = cases.map((c) => c.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`duplicate eval case id: ${duplicate}`);
  return cases;
};
