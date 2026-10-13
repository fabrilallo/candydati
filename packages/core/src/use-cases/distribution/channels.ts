import {
  FEED_CHANNEL_ID,
  FEED_CHANNEL_LABEL,
  feedUrl,
  llmsTxtUrl,
  setChannelEnabledInputSchema,
  type DistributionChannelDto,
  type DistributionOverviewDto,
} from '@tt/domain';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../../errors.js';
import { requireOrganization } from './organization.js';
import { defineDistributionUseCase } from './define.js';

/** The feed, then the registered channels with the organization's switch (default on). */
export const getDistributionOverview = defineDistributionUseCase({
  name: 'getDistributionOverview',
  input: z.object({}),
  permission: 'job:read',
  audit: { skip: 'read-only' },
  handler: async ({ deps, actor }): Promise<DistributionOverviewDto> => {
    const { slug } = await requireOrganization(deps, actor.organizationId);
    const settings = await deps.distributionSettings.list(actor.organizationId);
    const registered: DistributionChannelDto[] = deps.registry.list().map((channel) => ({
      channelId: channel.id,
      label: channel.label,
      builtIn: false,
      enabled: settings.find((setting) => setting.channelId === channel.id)?.enabled ?? true,
    }));
    return {
      feedUrl: feedUrl(deps.publicBaseUrl, slug),
      llmsTxtUrl: llmsTxtUrl(deps.publicBaseUrl, slug),
      channels: [{ channelId: FEED_CHANNEL_ID, label: FEED_CHANNEL_LABEL, builtIn: true, enabled: true }, ...registered],
    };
  },
});

const toggleInput = z.object({ channelId: z.string().min(1) }).extend(setChannelEnabledInputSchema.shape);

/**
 * Switches a registered channel on or off for the organization. The feed cannot be switched (it is the open, always-on
 * channel) and an unknown id is "not found". The change takes effect at the next sync of each ad.
 */
export const setChannelEnabled = defineDistributionUseCase({
  name: 'setChannelEnabled',
  input: toggleInput,
  permission: 'organization:update',
  audit: {
    action: 'distribution.channel_updated',
    target: (input) => ({ type: 'distribution_channel', id: input.channelId }),
    metadata: (input) => ({ enabled: input.enabled }),
  },
  handler: async ({ deps, actor, input }): Promise<DistributionChannelDto> => {
    if (input.channelId === FEED_CHANNEL_ID) throw new ValidationError([{ path: 'channelId', message: 'feed_cannot_be_switched' }]);
    const channel = deps.registry.get(input.channelId);
    if (!channel) throw new NotFoundError('Channel not found.');
    await deps.distributionSettings.save({ organizationId: actor.organizationId, channelId: channel.id, enabled: input.enabled, updatedAt: deps.now() });
    return { channelId: channel.id, label: channel.label, builtIn: false, enabled: input.enabled };
  },
});
