import { describe, expect, it } from 'vitest';
import { CHANNEL_ID_PATTERN, DISTRIBUTION_STATUSES, setChannelEnabledInputSchema } from './distribution.js';
import { careersUrl, feedUrl, jobUrl, llmsTxtUrl } from './urls.js';

describe('distribution', () => {
  it('knows four statuses and a strict channel id', () => {
    expect(DISTRIBUTION_STATUSES).toEqual(['pending', 'published', 'failed', 'removed']);
    expect(CHANNEL_ID_PATTERN.test('indeed_it')).toBe(true);
    expect(['', 'Feed', '-x', 'a b', 'a/b'].filter((id) => CHANNEL_ID_PATTERN.test(id))).toEqual([]);
  });

  it('requires a boolean to switch a channel', () => {
    expect(setChannelEnabledInputSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(setChannelEnabledInputSchema.safeParse({ enabled: 'no' }).success).toBe(false);
    expect(setChannelEnabledInputSchema.safeParse({}).success).toBe(false);
  });

  it('builds stable path URLs without a double slash', () => {
    expect(careersUrl('https://x.test/', 'acme')).toBe('https://x.test/careers/acme');
    expect(jobUrl('https://x.test', 'acme', 'dev-1')).toBe('https://x.test/careers/acme/dev-1');
    expect(feedUrl('https://x.test', 'acme')).toBe('https://x.test/careers/acme/jobs.xml');
    expect(llmsTxtUrl('https://x.test', 'acme')).toBe('https://x.test/careers/acme/llms.txt');
  });
});
