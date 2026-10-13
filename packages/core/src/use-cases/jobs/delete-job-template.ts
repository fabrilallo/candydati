import { z } from 'zod';
import { NotFoundError } from '../../errors.js';
import { defineJobUseCase } from './define.js';

export const deleteJobTemplate = defineJobUseCase({
  name: 'deleteJobTemplate',
  input: z.object({ templateId: z.string().min(1) }),
  permission: 'job_template:delete',
  audit: {
    action: 'job_template.deleted',
    target: (input) => ({ type: 'job_template', id: input.templateId }),
  },
  handler: async ({ deps, actor, input }): Promise<{ readonly templateId: string }> => {
    const deleted = await deps.jobTemplates.delete(actor.organizationId, input.templateId);
    if (!deleted) throw new NotFoundError('Template not found.');
    return { templateId: input.templateId };
  },
});
