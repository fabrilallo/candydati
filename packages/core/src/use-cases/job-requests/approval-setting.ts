import { checkApproval, type JobApproval } from '@tt/domain';
import { z } from 'zod';
import { requireJob } from '../jobs/shared.js';
import { defineJobRequestUseCase } from './define.js';
import { sequential } from '../../sequential.js';

export const getApprovalSetting = defineJobRequestUseCase({
  name: 'getApprovalSetting',
  input: z.object({}),
  permission: 'job:read',
  audit: { skip: 'read-only setting' },
  handler: async ({ deps, actor }) => ({ requireApproval: (await deps.organizationSettings.get(actor.organizationId)).requireApproval }),
});

/** Turns "publishing needs an approved budget" on or off for the organization. Owners and admins only (`job:approve`). */
export const setApprovalSetting = defineJobRequestUseCase({
  name: 'setApprovalSetting',
  input: z.object({ requireApproval: z.boolean() }),
  permission: 'job:approve',
  audit: {
    action: 'organization.approval_setting_updated',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input) => ({ requireApproval: input.requireApproval }),
  },
  handler: async ({ deps, actor, input }) => ({
    requireApproval: (await deps.organizationSettings.setRequireApproval(actor.organizationId, input.requireApproval, deps.now())).requireApproval,
  }),
});

export interface JobApprovalStatus {
  readonly requireApproval: boolean;
  readonly approval: JobApproval | null;
  /** True when the job can be published as far as approval goes. */
  readonly publishable: boolean;
}

/** What the editor shows next to the publish button: is approval required and does the job have one. */
export const getJobApprovalStatus = defineJobRequestUseCase({
  name: 'getJobApprovalStatus',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'job:read',
  audit: { skip: 'read-only' },
  handler: async ({ deps, actor, input }): Promise<JobApprovalStatus> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const [settings, approval] = await sequential(() => deps.organizationSettings.get(actor.organizationId), () => deps.approvals.find(actor.organizationId, job.id));
    return { requireApproval: settings.requireApproval, approval, publishable: checkApproval(settings.requireApproval, approval, job.content.salary) === null };
  },
});
