import { z } from 'zod';
import { requireCandidate } from '../candidates/shared.js';
import { buildCandidateExport, type CandidateExportBundle } from './build-candidate-export.js';
import { defineRightsUseCase } from './rights.js';

export type CandidateExportResult = CandidateExportBundle;

/**
 * Right of access and portability (art. 15, 20): `candidate.json` in the public schema plus the original CV files. The
 * api puts them in a ZIP with a `ZipWriter`. Audited with counts only.
 */
export const exportCandidate = defineRightsUseCase({
  name: 'exportCandidate',
  input: z.object({ candidateId: z.string().min(1) }),
  permission: 'candidate:export',
  audit: {
    action: 'candidate.exported',
    target: (input) => ({ type: 'candidate', id: input.candidateId }),
    metadata: (_input, result: CandidateExportResult) => ({
      applicationCount: result.json.applications.length,
      fileCount: result.files.length,
      missingFileCount: result.missingFiles.length,
    }),
  },
  handler: async ({ deps, actor, input }): Promise<CandidateExportResult> => {
    const candidate = await requireCandidate(deps, actor.organizationId, input.candidateId);
    return buildCandidateExport(deps, candidate, deps.now());
  },
});
