import { describe, expect, it } from 'vitest';
import { distributionOverviewSchema, jobDistributionSchema } from './distribution.js';

describe('distribution wire schemas', () => {
  it('reads the channels of a job and refuses a status the domain does not have', () => {
    const row = { channelId: 'feed', label: 'Feed XML', status: 'published', url: 'https://x/feed', error: null, updatedAt: '2026-05-01T10:00:00.000Z' };
    expect(jobDistributionSchema.parse([row])).toEqual([row]);
    expect(jobDistributionSchema.safeParse([{ ...row, status: 'feed' }]).success).toBe(false);
  });

  it('reads the overview with its two urls', () => {
    const overview = { feedUrl: 'https://x/feed', llmsTxtUrl: 'https://x/llms.txt', channels: [{ channelId: 'feed', label: 'Feed XML', builtIn: true, enabled: true }] };
    expect(distributionOverviewSchema.parse(overview)).toEqual(overview);
    expect(distributionOverviewSchema.safeParse({ channels: [] }).success).toBe(false);
  });
});
