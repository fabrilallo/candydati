import { TRACKED_LINKS_MAX } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { agentActor, userActor } from '../../testing/actors.js';
import { createInMemoryJobRepository } from '../../testing/in-memory-jobs.js';
import { createInMemoryTrackedLinks } from '../../testing/in-memory-tracked-links.js';
import { buildJob } from '../../testing/job-fixtures.js';
import { createTestJobDeps } from '../../testing/job-deps.js';
import { createTrackedLink, listTrackedLinks, removeTrackedLink } from './tracked-links.js';

const ORG = 'org_test';
const owner = userActor({ organizationId: ORG });
const recruiter = userActor({ organizationId: ORG, id: 'rec_1', role: 'recruiter' });
const hiringManager = userActor({ organizationId: ORG, id: 'hm_1', role: 'hiring_manager' });

const world = () => {
  const base = createTestJobDeps({
    jobs: createInMemoryJobRepository([buildJob({ id: 'job_1', status: 'published' }), buildJob({ id: 'job_x', organizationId: 'org_other' })]),
  });
  return { ...base, trackedLinks: createInMemoryTrackedLinks() };
};

describe('tracked links', () => {
  it('saves one link per channel and campaign, sanitized, and lists them oldest first', async () => {
    const deps = world();
    const first = await createTrackedLink(deps, recruiter, { jobId: 'job_1', source: 'LinkedIn' });
    expect(first).toEqual({ created: true, link: expect.objectContaining({ jobId: 'job_1', source: 'linkedin', campaign: '' }) });
    await createTrackedLink(deps, recruiter, { jobId: 'job_1', source: 'linkedin', campaign: 'Autumn 2026' });
    await createTrackedLink(deps, recruiter, { jobId: 'job_1', source: 'Fiera Lavoro / Bologna' });
    const links = await listTrackedLinks(deps, recruiter, { jobId: 'job_1' });
    expect(links.map((link) => [link.source, link.campaign])).toEqual([['linkedin', ''], ['linkedin', 'autumn-2026'], ['fiera-lavoro-bologna', '']]);
    expect(links[0]).toEqual({ id: first.link.id, jobId: 'job_1', source: 'linkedin', campaign: '', createdAt: '2026-06-01T10:00:00.000Z' });
    expect(deps.trackedLinks.snapshot()[0]?.createdBy).toBe('rec_1');
  });

  it('answers with the existing link for a pair already saved, and audits only the first save', async () => {
    const deps = world();
    const first = await createTrackedLink(deps, owner, { jobId: 'job_1', source: 'indeed', campaign: 'spring' });
    const again = await createTrackedLink(deps, owner, { jobId: 'job_1', source: 'Indeed', campaign: 'Spring' });
    expect(again).toEqual({ created: false, link: first.link });
    expect(deps.trackedLinks.snapshot()).toHaveLength(1);
    const events = deps.auditLog.events().filter((event) => event.action === 'job.tracked_link_created');
    expect(events).toEqual([expect.objectContaining({ target: { type: 'job', id: 'job_1' }, metadata: { linkId: first.link.id, source: 'indeed', campaign: 'spring' } })]);
  });

  it('refuses a channel that is empty, personal data or reserved', async () => {
    const deps = world();
    for (const source of ['', 'mario.rossi@example.org', 'direct', 'manual', 'import']) {
      await expect(createTrackedLink(deps, owner, { jobId: 'job_1', source })).rejects.toBeInstanceOf(ValidationError);
    }
    expect(deps.trackedLinks.snapshot()).toEqual([]);
  });

  it('stops at the maximum number of links of a job', async () => {
    const deps = world();
    for (let index = 0; index < TRACKED_LINKS_MAX; index += 1) await createTrackedLink(deps, owner, { jobId: 'job_1', source: `channel-${index}` });
    await expect(createTrackedLink(deps, owner, { jobId: 'job_1', source: 'one-more' })).rejects.toBeInstanceOf(ValidationError);
    expect((await createTrackedLink(deps, owner, { jobId: 'job_1', source: 'channel-0' })).created).toBe(false);
  });

  it('removes a link and audits it; removing it again or on another job finds nothing', async () => {
    const deps = world();
    const { link } = await createTrackedLink(deps, owner, { jobId: 'job_1', source: 'newsletter' });
    expect(await removeTrackedLink(deps, recruiter, { jobId: 'job_1', linkId: link.id })).toEqual({ removed: true });
    expect(deps.auditLog.events().map((event) => event.action)).toContain('job.tracked_link_removed');
    await expect(removeTrackedLink(deps, owner, { jobId: 'job_1', linkId: link.id })).rejects.toBeInstanceOf(NotFoundError);
    expect(await listTrackedLinks(deps, owner, { jobId: 'job_1' })).toEqual([]);
  });

  it('keeps every job of another organization out of reach', async () => {
    const deps = world();
    await expect(listTrackedLinks(deps, owner, { jobId: 'job_x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createTrackedLink(deps, owner, { jobId: 'job_x', source: 'linkedin' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is for people who publish ads: a hiring manager can neither read nor change the links', async () => {
    const deps = world();
    await expect(listTrackedLinks(deps, hiringManager, { jobId: 'job_1' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTrackedLink(deps, hiringManager, { jobId: 'job_1', source: 'linkedin' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('records the person behind the assistant as the author', async () => {
    const deps = world();
    await createTrackedLink(deps, agentActor({ organizationId: ORG, onBehalfOfUserId: 'user_test' }), { jobId: 'job_1', source: 'x' });
    expect(deps.trackedLinks.snapshot()[0]?.createdBy).toBe('user_test');
  });
});
