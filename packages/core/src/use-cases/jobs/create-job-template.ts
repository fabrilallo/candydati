import { jobContentSchema, TEMPLATE_NAME_MAX, type JobTemplate } from '@tt/domain';
import { z } from 'zod';
import { defineJobUseCase } from './define.js';
import { withStageIds } from './shared.js';

const inputSchema = z.object({ name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX), content: jobContentSchema });

export const createJobTemplate = defineJobUseCase({
  name: 'createJobTemplate',
  input: inputSchema,
  permission: 'job_template:create',
  audit: {
    action: 'job_template.created',
    target: (_input, template: JobTemplate) => ({ type: 'job_template', id: template.id }),
    metadata: (_input, template: JobTemplate) => ({ name: template.name }),
  },
  handler: async ({ deps, actor, input }): Promise<JobTemplate> => {
    const now = deps.now();
    return deps.jobTemplates.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      name: input.name,
      content: withStageIds(input.content, deps.newId),
      // The person behind an agent or API key owns the ad (deadline reminders go to them), never the key.
      createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
      createdAt: now,
      updatedAt: now,
    });
  },
});
