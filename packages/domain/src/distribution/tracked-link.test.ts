import { describe, expect, it } from 'vitest';
import { trackedLinkInputSchema, trackedLinkKey, trackedLinkSchema, toTrackedLinkDto } from './tracked-link.js';

describe('trackedLinkKey', () => {
  it('stores the channel and campaign the way the reports name them', () => {
    expect(trackedLinkKey({ source: 'LinkedIn', campaign: 'Autumn 2026' })).toEqual({ source: 'linkedin', campaign: 'autumn-2026' });
    expect(trackedLinkKey({ source: 'Fiera Lavoro / Bologna', campaign: '' })).toEqual({ source: 'fiera-lavoro-bologna', campaign: '' });
  });

  it('refuses a channel that would read as direct, an import or a manual entry', () => {
    for (const source of ['', '   ', 'mario.rossi@example.org', 'direct', 'import', 'Manual']) expect(trackedLinkKey({ source, campaign: '' })).toBeNull();
  });

  it('drops a campaign that is personal data', () => {
    expect(trackedLinkKey({ source: 'indeed', campaign: 'mario.rossi@example.org' })).toEqual({ source: 'indeed', campaign: '' });
  });
});

describe('tracked link schemas', () => {
  it('takes a source and an optional campaign, both bounded', () => {
    expect(trackedLinkInputSchema.parse({ source: 'linkedin' })).toEqual({ source: 'linkedin', campaign: '' });
    expect(trackedLinkInputSchema.safeParse({ source: 'x'.repeat(201) }).success).toBe(false);
    expect(trackedLinkInputSchema.safeParse({ source: 'x', campaign: 'y'.repeat(201) }).success).toBe(false);
    expect(trackedLinkInputSchema.safeParse({}).success).toBe(false);
  });

  it('turns a stored link into its wire shape and reads it back', () => {
    const dto = toTrackedLinkDto({
      id: 'tl_1',
      organizationId: 'org_1',
      jobId: 'job_1',
      source: 'linkedin',
      campaign: '',
      createdBy: 'user_1',
      createdAt: new Date('2026-10-01T10:00:00Z'),
    });
    expect(dto).toEqual({ id: 'tl_1', jobId: 'job_1', source: 'linkedin', campaign: '', createdAt: '2026-10-01T10:00:00.000Z' });
    expect(trackedLinkSchema.parse(dto)).toEqual(dto);
  });
});
