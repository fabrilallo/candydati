import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../errors.js';
import { buildJob, createInMemoryJobRepository, createInMemoryOrganizationDirectory, createInMemoryPrivacyNoticeRepository } from '../../testing/index.js';
import { getPublicFeed, getPublicOrganizationSummary } from './get-public-site.js';

const publishedAt = new Date('2026-05-01T00:00:00Z');
const jobs = [
  buildJob({ id: 'pub', slug: 'pub-1', organizationId: 'org_a', status: 'published', publishedAt, updatedAt: new Date('2026-05-03T00:00:00Z') }),
  buildJob({ id: 'draft', slug: 'draft-1', organizationId: 'org_a' }),
  buildJob({ id: 'closed', slug: 'closed-1', organizationId: 'org_a', status: 'closed', publishedAt, closedAt: publishedAt }),
  buildJob({ id: 'other', slug: 'other-1', organizationId: 'org_b', status: 'published', publishedAt }),
];
const deps = {
  jobs: createInMemoryJobRepository(jobs),
  organizations: createInMemoryOrganizationDirectory([
    { id: 'org_a', name: 'Acme', slug: 'acme', logo: 'https://cdn.test/logo.png' },
    { id: 'org_b', name: 'Beta', slug: 'beta', logo: null },
    { id: 'org_c', name: 'Gamma', slug: 'gamma', logo: null, logoFile: { mediaId: 'm1', fileName: 'abc-w640.webp' } },
  ]),
  privacyNotices: createInMemoryPrivacyNoticeRepository(),
  publicBaseUrl: 'https://jobs.example.com/',
};

describe('getPublicOrganizationSummary', () => {
  it('names the organization, links the careers page and the feed, counts only open ads', async () => {
    expect(await getPublicOrganizationSummary(deps, { organizationSlug: 'acme' })).toEqual({
      name: 'Acme',
      slug: 'acme',
      logo: 'https://cdn.test/logo.png',
      careersUrl: 'https://jobs.example.com/careers/acme',
      feedUrl: 'https://jobs.example.com/careers/acme/jobs.xml',
      openPositions: 1,
    });
  });

  it('gives a library logo as an absolute address, for sites that embed it', async () => {
    expect((await getPublicOrganizationSummary(deps, { organizationSlug: 'gamma' })).logo).toBe('https://jobs.example.com/api/v1/public/organizations/gamma/careers-media/m1/abc-w640.webp');
  });

  it('is not found for an unknown organization and validates the input', async () => {
    await expect(getPublicOrganizationSummary(deps, { organizationSlug: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPublicOrganizationSummary(deps, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it('never carries ids of people', async () => {
    expect(JSON.stringify(await getPublicOrganizationSummary(deps, { organizationSlug: 'acme' }))).not.toMatch(/org_a|user_test|createdBy/);
  });
});

describe('getPublicFeed', () => {
  it('returns the full content of the published ads only, with their last edit', async () => {
    const feed = await getPublicFeed(deps, { organizationSlug: 'acme' });
    expect(feed.organization).toEqual({ name: 'Acme', slug: 'acme', logo: 'https://cdn.test/logo.png' });
    expect(feed.jobs.map((job) => job.slug)).toEqual(['pub-1']);
    expect(feed.jobs[0]).toMatchObject({ publishedAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-03T00:00:00.000Z', content: { title: 'Backend Developer', summary: 'Build the core API.' } });
    expect(JSON.stringify(feed)).not.toMatch(/createdBy|quality|org_a|"id"/);
  });

  it('is not found for an unknown organization, and empty for one with nothing open', async () => {
    await expect(getPublicFeed(deps, { organizationSlug: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getPublicFeed(deps, { organizationSlug: 'beta' })).jobs).toHaveLength(1);
    const none = { ...deps, jobs: createInMemoryJobRepository([]) };
    expect((await getPublicFeed(none, { organizationSlug: 'acme' })).jobs).toEqual([]);
  });
});
