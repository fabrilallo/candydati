import type { Job } from '@candydati/domain';
import { z } from 'zod';
import { defineJobUseCase } from './define.js';
import { requireJob } from './shared.js';

export const getJob = defineJobUseCase({
  name: 'getJob',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job:read',
  audit: { skip: 'read-only; auditing reads would add an event on every page view' },
  handler: async ({ deps, actor, input }): Promise<Job> => requireJob(deps, actor.organizationId, input.jobId),
});
