import type { JobTemplate } from '@tt/domain';
import { z } from 'zod';
import { defineJobUseCase } from './define.js';

export const listJobTemplates = defineJobUseCase({
  name: 'listJobTemplates',
  input: z.object({}),
  permission: 'job_template:read',
  audit: { skip: 'read-only; auditing reads would add an event on every page view' },
  handler: async ({ deps, actor }): Promise<readonly JobTemplate[]> => deps.jobTemplates.list(actor.organizationId),
});
