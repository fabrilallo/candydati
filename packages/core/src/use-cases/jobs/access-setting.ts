import { z } from 'zod';
import { ForbiddenError } from '../../errors.js';
import type { OrganizationSettingsRepository } from '../../job-request-ports.js';
import type { CoreDeps } from '../../ports.js';
import { defineUseCase, type UseCase, type UseCaseDefinition } from '../../use-case.js';

export interface AccessSettingDeps extends CoreDeps {
  readonly organizationSettings: OrganizationSettingsRepository;
  readonly now: () => Date;
}

const defineAccessSettingUseCase = <S extends z.ZodType, O>(definition: UseCaseDefinition<AccessSettingDeps, S, O>): UseCase<AccessSettingDeps, O> =>
  defineUseCase<AccessSettingDeps, S, O>(definition);

export interface AccessSetting {
  readonly restrictRecruitersToTeam: boolean;
}

/** Whether recruiters see every job (default) or only the jobs whose team they are on. Any member may read it. */
export const getAccessSetting = defineAccessSettingUseCase({
  name: 'getAccessSetting',
  input: z.object({}),
  permission: 'job:read',
  audit: { skip: 'read-only setting' },
  handler: async ({ deps, actor }): Promise<AccessSetting> => ({
    restrictRecruitersToTeam: (await deps.organizationSettings.get(actor.organizationId)).restrictRecruitersToTeam,
  }),
});

/** Restricts recruiters to the jobs of their teams, or gives them every job again. Owners and admins only. */
export const setAccessSetting = defineAccessSettingUseCase({
  name: 'setAccessSetting',
  input: z.object({ restrictRecruitersToTeam: z.boolean() }),
  permission: 'organization:update',
  audit: {
    action: 'organization.access_setting_updated',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input) => ({ restrictRecruitersToTeam: input.restrictRecruitersToTeam }),
  },
  handler: async ({ deps, actor, input }): Promise<AccessSetting> => {
    // Who sees which candidates is an access decision: a person makes it, never a key or the assistant.
    if (actor.type !== 'user') throw new ForbiddenError();
    const settings = await deps.organizationSettings.setRestrictRecruitersToTeam(actor.organizationId, input.restrictRecruitersToTeam, deps.now());
    return { restrictRecruitersToTeam: settings.restrictRecruitersToTeam };
  },
});
