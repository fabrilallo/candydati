import { describe, expect, it } from 'vitest';
import { ORG_A, buildJob, createTestCandidateDeps } from '../../testing/index.js';
import { createInMemoryOrganizationDirectory } from '../../testing/in-memory-jobs.js';
import { createInMemoryJobViews } from '../../testing/in-memory-job-views.js';
import type { RecordJobViewDeps } from '../../job-view-ports.js';
import { recordJobView } from './record-job-view.js';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function world(status: 'published' | 'draft' = 'published') {
  const base = createTestCandidateDeps();
  const organizations = createInMemoryOrganizationDirectory([
    { id: ORG_A, name: 'Acme', slug: 'acme', logo: null },
    { id: 'org_b', name: 'Other', slug: 'other-org', logo: null },
  ]);
  const deps: RecordJobViewDeps = { jobs: base.jobs, organizations, jobViews: createInMemoryJobViews(base.store), now: base.now };
  await base.jobs.create(buildJob({ id: 'job_1', organizationId: ORG_A, slug: 'backend', status, publishedAt: status === 'published' ? new Date() : null }));
  return { deps, store: base.store };
}
const views = (w: Awaited<ReturnType<typeof world>>) => w.store.read().jobViews;
const visit = (extra = {}) => ({ organizationSlug: 'acme', jobSlug: 'backend', userAgent: CHROME, ...extra });

describe('recordJobView', () => {
  it('counts a visit of a published job under its day, source and campaign', async () => {
    const w = await world();
    await expect(recordJobView(w.deps, visit({ source: 'LinkedIn', campaign: 'Autumn 2026' }))).resolves.toEqual({ counted: true });
    await recordJobView(w.deps, visit({ source: 'linkedin', campaign: 'autumn-2026' }));
    expect(views(w)).toEqual([{ organizationId: ORG_A, jobId: 'job_1', day: '2026-06-01', source: 'linkedin', campaign: 'autumn-2026', views: 2 }]);
  });

  it('counts direct with no campaign when nothing was sent, and sanitizes what looks like personal data', async () => {
    const w = await world();
    await recordJobView(w.deps, visit());
    await recordJobView(w.deps, visit({ source: 'mario.rossi@example.org', campaign: 'a@b.it' }));
    expect(views(w).map((v) => [v.source, v.campaign, v.views])).toEqual([['direct', '', 2]]);
  });

  it('does not count crawlers, headless browsers or a missing user agent', async () => {
    const w = await world();
    for (const userAgent of ['Googlebot/2.1', 'HeadlessChrome/126', 'curl/8.4.0', undefined]) {
      await expect(recordJobView(w.deps, visit({ userAgent }))).resolves.toEqual({ counted: false });
    }
    expect(views(w)).toEqual([]);
  });

  it('ignores unknown organizations and jobs, and jobs that are not published', async () => {
    const w = await world('draft');
    expect(await recordJobView(w.deps, visit())).toEqual({ counted: false });
    expect(await recordJobView(w.deps, visit({ organizationSlug: 'nobody' }))).toEqual({ counted: false });
    expect(await recordJobView(w.deps, visit({ jobSlug: 'missing' }))).toEqual({ counted: false });
    expect(views(w)).toEqual([]);
  });

  it('never counts a job through the slug of another organization', async () => {
    const w = await world();
    expect(await recordJobView(w.deps, visit({ organizationSlug: 'other-org' }))).toEqual({ counted: false });
  });

  it('refuses an input that is not valid', async () => {
    const w = await world();
    await expect(recordJobView(w.deps, { organizationSlug: '', jobSlug: 'x' })).rejects.toThrow();
  });
});
