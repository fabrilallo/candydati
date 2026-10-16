import { candidateCorrectionSchema, CORRECTABLE_FIELDS, type Candidate, type CorrectableField } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import { defineCandidateUseCase } from '../candidates/define.js';
import { loadCandidateDetail, requireCandidate } from '../candidates/shared.js';
import type { CandidateDetailView } from '../candidates/views.js';

const sameValue = (field: CorrectableField, current: Candidate, next: unknown): boolean =>
  field === 'email' ? String(next).toLowerCase() === current.email.toLowerCase() : current[field] === next;

/** Names of the fields that really change: a field sent with its current value is not a correction. */
const changedFields = (current: Candidate, changes: Record<string, unknown>): readonly CorrectableField[] =>
  CORRECTABLE_FIELDS.filter((field) => changes[field] !== undefined && !sameValue(field, current, changes[field]));

export interface CorrectionResult {
  readonly detail: CandidateDetailView;
  /** Names of the fields that changed. */
  readonly fields: readonly CorrectableField[];
}

/**
 * Right to rectification (art. 16): name, email, phone, LinkedIn. The email stays unique in the organization
 * (ConflictError otherwise). The audit event carries the NAMES of the changed fields, never the values.
 */
export const correctCandidate = defineCandidateUseCase({
  name: 'correctCandidate',
  input: z.object({ candidateId: z.string().min(1), changes: candidateCorrectionSchema }),
  permission: 'candidate:update',
  audit: {
    action: 'candidate.corrected',
    target: (input) => ({ type: 'candidate', id: input.candidateId }),
    metadata: (_input, result: CorrectionResult) => ({ fields: result.fields }),
  },
  handler: async ({ deps, actor, input }): Promise<CorrectionResult> => {
    const candidate = await requireCandidate(deps, actor.organizationId, input.candidateId);
    const changes: Record<string, unknown> = { ...input.changes };
    const fields = changedFields(candidate, changes);
    if (fields.length === 0) return { detail: await loadCandidateDetail(deps, candidate), fields };
    if (fields.includes('email')) {
      const owner = await deps.candidates.findByEmail(actor.organizationId, String(changes.email));
      if (owner && owner.id !== candidate.id) throw new ConflictError('A candidate with this email already exists.');
    }
    const patch = Object.fromEntries(fields.map((field) => [field, changes[field]]));
    const saved = await deps.candidates.save({ ...candidate, ...patch, updatedAt: deps.now() });
    return { detail: await loadCandidateDetail(deps, saved), fields };
  },
});
