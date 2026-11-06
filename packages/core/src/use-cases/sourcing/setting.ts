import { z } from 'zod';
import { ForbiddenError } from '../../errors.js';
import { defineSourcingUseCase } from './define.js';

export interface SourcingSetting {
  /** Contacts with a known email get the art. 14 notice by email at once; otherwise it goes with the first message. */
  readonly noticeByEmail: boolean;
}

export const getSourcingSetting = defineSourcingUseCase({
  name: 'getSourcingSetting',
  input: z.object({}),
  permission: 'sourcing:manage',
  audit: { skip: 'read-only setting' },
  handler: async ({ deps, actor }): Promise<SourcingSetting> => ({ noticeByEmail: (await deps.organizationSettings.get(actor.organizationId)).sourcingNoticeByEmail }),
});

/** How the organization, as data controller, informs the people it sources. A person decides, never a key or the assistant. */
export const setSourcingSetting = defineSourcingUseCase({
  name: 'setSourcingSetting',
  input: z.object({ noticeByEmail: z.boolean() }),
  permission: 'privacy:manage',
  audit: {
    action: 'organization.sourcing_setting_updated',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input) => ({ noticeByEmail: input.noticeByEmail }),
  },
  handler: async ({ deps, actor, input }): Promise<SourcingSetting> => {
    if (actor.type !== 'user') throw new ForbiddenError();
    const settings = await deps.organizationSettings.setSourcingNoticeByEmail(actor.organizationId, input.noticeByEmail, deps.now());
    return { noticeByEmail: settings.sourcingNoticeByEmail };
  },
});
