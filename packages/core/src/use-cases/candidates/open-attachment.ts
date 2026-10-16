import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { defineCandidateUseCase } from './define.js';
import { requireApplication } from './shared.js';
import type { AttachmentFile } from './views.js';

/**
 * An attachment of an application (a cover letter, a portfolio brought by a migration), with the same permission, the
 * same per-job access and the same audit as the CV (`openCv`): every download or preview is recorded. An attachment of
 * another application, or of an application out of reach, does not exist.
 */
export const openAttachment = defineCandidateUseCase({
  name: 'openAttachment',
  input: z.object({ applicationId: z.string().min(1), attachmentId: z.string().min(1) }),
  permission: 'candidate:read',
  audit: {
    action: 'candidate.attachment_downloaded',
    target: (input) => ({ type: 'application', id: input.applicationId }),
    metadata: (input) => ({ attachmentId: input.attachmentId }),
  },
  handler: async ({ deps, actor, input }): Promise<AttachmentFile> => {
    const application = await requireApplication(deps, actor.organizationId, input.applicationId);
    const attachment = await deps.applications.findAttachment(actor.organizationId, application.id, input.attachmentId);
    if (!attachment) throw new NotFoundError('Attachment not found.');
    const bytes = await deps.files.get(attachment.key);
    return { bytes, fileName: attachment.fileName, mediaType: attachment.mediaType };
  },
});
