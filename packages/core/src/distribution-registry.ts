import { CHANNEL_ID_PATTERN, FEED_CHANNEL_ID } from '@tt/domain';
import type { DistributionChannel, DistributionRegistry } from './distribution-ports.js';

/** Fails at startup, not at the first publication: a malformed or duplicated id is a configuration bug. */
export function createDistributionRegistry(channels: readonly DistributionChannel[]): DistributionRegistry {
  const seen = new Set<string>();
  for (const channel of channels) {
    if (!CHANNEL_ID_PATTERN.test(channel.id) || channel.id === FEED_CHANNEL_ID) throw new Error(`Invalid distribution channel id "${channel.id}".`);
    if (seen.has(channel.id)) throw new Error(`Distribution channel "${channel.id}" is registered twice.`);
    seen.add(channel.id);
  }
  const list = [...channels];
  return { list: () => list, get: (channelId) => list.find((channel) => channel.id === channelId) ?? null };
}

/** The self-hosted default: only the built-in feed, no external channel and no `if hosted` anywhere. */
export const emptyDistributionRegistry: DistributionRegistry = createDistributionRegistry([]);
