import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../errors.js';
import { buildJob, completeJobContent, createInMemoryJobRepository, createInMemoryOrganizationDirectory } from '../../testing/index.js';
import { getPublicCareers } from './get-public-careers.js';
import { getPublicJob } from './get-public-job.js';

const orgs = [
  { id: 'org_a', name: 'Acme', slug: 'acme', logo: null },
  { id: 'org_b', name: 'Beta', slug: 'beta', logo: 'https://x/logo.png' },
];
const deps = () => ({
  organizations: createInMemoryOrganizationDirectory(orgs),
  jobs: createInMemoryJobRepository([
    buildJob({ id: '1', slug: 'pub-old', organizationId: 'org_a', status: 'published', publishedAt: new Date(2026, 0, 1) }),
    buildJob({ id: '2', slug: 'pub-new', organizationId: 'org_a', status: 'published', publishedAt: new Date(2026, 0, 5) }),
    buildJob({ id: '3', slug: 'draft', organizationId: 'org_a', status: 'draft' }),
    buildJob({ id: '4', slug: 'closed', organizationId: 'org_a', status: 'closed', publishedAt: new Date(2026, 0, 2), closedAt: new Date() }),
    buildJob({ id: '5', slug: 'other', organizationId: 'org_b', status: 'published', publishedAt: new Date(2026, 0, 3) }),
  ]),
});

describe('getPublicCareers', () => {
  it('returns only the published jobs of the organization, newest first', async () => {
    const result = await getPublicCareers(deps(), { organizationSlug: 'acme' });
    expect(result.organization).toEqual({ name: 'Acme', slug: 'acme', logo: null });
    expect(result.jobs.map((j) => j.slug)).toEqual(['pub-new', 'pub-old']);
    expect(JSON.stringify(result)).not.toContain('org_a');
  });

  it('is not found for unknown organizations and validates input', async () => {
    await expect(getPublicCareers(deps(), { organizationSlug: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPublicCareers(deps(), {})).rejects.toBeInstanceOf(ValidationError);
  });

  it('fails loudly when a published job is corrupted', async () => {
    const d = {
      ...deps(),
      jobs: createInMemoryJobRepository([
        buildJob({ organizationId: 'org_a', status: 'published', publishedAt: new Date(), content: completeJobContent({ title: 'x', process: [] }) }),
      ]),
    };
    await expect(getPublicCareers(d, { organizationSlug: 'acme' })).rejects.toThrow(/published/i);
  });
});

describe('getPublicJob', () => {
  it('returns a published job of the right organization', async () => {
    const result = await getPublicJob(deps(), { organizationSlug: 'acme', jobSlug: 'pub-new' });
    expect(result.job.slug).toBe('pub-new');
    expect(result.organization.slug).toBe('acme');
  });

  it.each(['draft', 'closed', 'other', 'missing'])('does not reveal %s', async (jobSlug) => {
    await expect(getPublicJob(deps(), { organizationSlug: 'acme', jobSlug })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is not found for unknown organizations', async () => {
    await expect(getPublicJob(deps(), { organizationSlug: 'nope', jobSlug: 'pub-new' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
