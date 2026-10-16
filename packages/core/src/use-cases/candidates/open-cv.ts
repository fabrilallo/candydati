import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { defineCandidateUseCase } from './define.js';
import { requireApplication } from './shared.js';
import type { CvFile } from './views.js';

/** The original document, always reachable (PRODUCT.md §4). Every download or preview is audited. */
export const openCv = defineCandidateUseCase({
  name: 'openCv',
  input: z.object({ applicationId: z.string().min(1) }),
  permission: 'candidate:read',
  audit: {
    action: 'candidate.cv_downloaded',
    target: (input) => ({ type: 'application', id: input.applicationId }),
  },
  handler: async ({ deps, actor, input }): Promise<CvFile> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    // A migrated application may come without a CV: nothing to open, nothing to audit.
    const { cv } = application;
    if (!cv) throw new NotFoundError('This application has no CV.');
    const bytes = await deps.files.get(cv.key);
    return { bytes, fileName: cv.fileName, mediaType: cv.mediaType };
  },
});
