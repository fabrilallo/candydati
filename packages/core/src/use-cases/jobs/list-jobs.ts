import { JOB_STATUSES, type Job, type PageMeta } from '@tt/domain';
import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../list-audit-log.js';
import { defineJobUseCase } from './define.js';

const inputSchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export interface JobPageResult {
  readonly items: readonly Job[];
  readonly meta: PageMeta;
}

export const listJobs = defineJobUseCase({
  name: 'listJobs',
  input: inputSchema,
  permission: 'job:read',
  audit: { skip: 'read-only; auditing reads would add an event on every page view' },
  handler: async ({ deps, actor, input }): Promise<JobPageResult> => {
    const { items, total } = await deps.jobs.list({ ...input, organizationId: actor.organizationId });
    return { items, meta: { total, page: input.page, limit: input.limit } };
  },
});
