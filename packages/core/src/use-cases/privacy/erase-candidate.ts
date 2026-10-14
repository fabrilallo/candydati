import type { Candidate } from '@tt/domain';
import { z } from 'zod';
import { toAuditActor } from '../../actor.js';
import { ValidationError } from '../../errors.js';
import { requireApplication, requireCandidate } from '../candidates/shared.js';
import { eraseCandidateData } from './erase-candidate-data.js';
import { defineRightsUseCase, normalizeName } from './rights.js';

export interface ErasureOutcome {
  readonly erased: true;
  readonly applicationCount: number;
  readonly candidateErased: boolean;
}

/** The recruiter types the candidate's full name before anything is deleted. */
function assertConfirmed(candidate: Pick<Candidate, 'firstName' | 'lastName'>, confirmName: string): void {
  if (normalizeName(confirmName) !== normalizeName(`${candidate.firstName} ${candidate.lastName}`)) {
    throw new ValidationError([{ path: 'confirmName', message: 'confirmation_mismatch' }]);
  }
}

// Audit: `eraseCandidateData` writes `candidate.erased` inside the erasure transaction, so these use cases append nothing.

/** Erases the whole candidate (right to erasure, art. 17) after the name is confirmed. Reason: `request`. */
export const eraseCandidate = defineRightsUseCase({
  name: 'eraseCandidate',
  input: z.object({ candidateId: z.string().min(1), confirmName: z.string() }),
  permission: 'candidate:erase',
  audit: { action: () => null, target: (input) => ({ type: 'candidate', id: input.candidateId }) },
  handler: async ({ deps, actor, input, jobScope }): Promise<ErasureOutcome> => {
    const candidate = await requireCandidate(deps, actor.organizationId, input.candidateId);
    assertConfirmed(candidate, input.confirmName);
    // Someone limited to some jobs erases only the applications of those jobs: the rest of the person stays.
    const scoped = (await jobScope()).kind === 'jobs';
    const applicationIds = scoped ? (await deps.applications.listByCandidate(actor.organizationId, candidate.id)).map((a) => a.id) : undefined;
    const result = await eraseCandidateData(deps, {
      organizationId: actor.organizationId,
      candidateId: candidate.id,
      applicationIds,
      reason: 'request',
      actor: toAuditActor(actor),
    });
    return { erased: true, ...result };
  },
});

/** Erases one application (and the candidate when it was the last one). The candidate's full name confirms it. */
export const eraseApplication = defineRightsUseCase({
  name: 'eraseApplication',
  input: z.object({ applicationId: z.string().min(1), confirmName: z.string() }),
  permission: 'candidate:erase',
  audit: { action: () => null, target: (input) => ({ type: 'application', id: input.applicationId }) },
  handler: async ({ deps, actor, input }): Promise<ErasureOutcome> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    const candidate = await requireCandidate(deps, actor.organizationId, application.candidateId);
    assertConfirmed(candidate, input.confirmName);
    const result = await eraseCandidateData(deps, {
      organizationId: actor.organizationId,
      candidateId: candidate.id,
      applicationIds: [application.id],
      reason: 'request',
      actor: toAuditActor(actor),
    });
    return { erased: true, ...result };
  },
});
