import type { SavedTrackedLinkDto, TrackedLinkDto } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const linksOf = (jobId: string) => `/api/v1/jobs/${jobId}/tracked-links`;

describe('tracked links over HTTP', () => {
  it('saves one link per channel and campaign, lists them when the page is opened again, and removes them', async () => {
    const w = await createWorld(t);
    const created = await w.owner.post<SavedTrackedLinkDto>(linksOf(w.job.id), { source: 'LinkedIn' });
    expect(created.status).toBe(201);
    expect(created.body.data).toEqual({ created: true, link: expect.objectContaining({ jobId: w.job.id, source: 'linkedin', campaign: '' }) });
    expect((await w.owner.post(linksOf(w.job.id), { source: 'linkedin', campaign: 'Autumn 2026' })).status).toBe(201);
    const again = await w.owner.post<SavedTrackedLinkDto>(linksOf(w.job.id), { source: 'linkedin' });
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ created: false, link: created.body.data!.link });

    const listed = (await w.owner.get<TrackedLinkDto[]>(linksOf(w.job.id))).body.data!;
    expect(listed.map((link) => [link.source, link.campaign])).toEqual([['linkedin', ''], ['linkedin', 'autumn-2026']]);

    const linkId = created.body.data!.link.id;
    expect((await w.owner.delete(`${linksOf(w.job.id)}/${linkId}`)).body.data).toEqual({ removed: true });
    expect((await w.owner.delete(`${linksOf(w.job.id)}/${linkId}`)).status).toBe(404);
    expect((await w.owner.get<TrackedLinkDto[]>(linksOf(w.job.id))).body.data!.map((link) => link.campaign)).toEqual(['autumn-2026']);

    const actions = (await w.owner.get<{ action: string }[]>('/api/v1/audit-log')).body.data!.map((event) => event.action);
    expect(actions.filter((action) => action === 'job.tracked_link_created')).toHaveLength(2);
    expect(actions).toContain('job.tracked_link_removed');
  });

  it('refuses a channel that is not a name, and people who do not publish ads', async () => {
    const w = await createWorld(t);
    expect((await w.owner.post(linksOf(w.job.id), { source: 'mario.rossi@example.org' })).status).toBe(422);
    expect((await w.owner.post(linksOf(w.job.id), {})).status).toBe(422);
    const hm = await w.member('hiring_manager');
    await w.joinTeam(hm, 'hiring_manager');
    expect((await hm.get(linksOf(w.job.id))).status).toBe(403);
    expect((await hm.post(linksOf(w.job.id), { source: 'indeed' })).status).toBe(403);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.post(linksOf(w.job.id), { source: 'indeed' })).status).toBe(201);
  });

  it('never reaches the jobs of another organization', async () => {
    const [mine, theirs] = [await createWorld(t, 'Mine'), await createWorld(t, 'Theirs')];
    const saved = (await theirs.owner.post<SavedTrackedLinkDto>(linksOf(theirs.job.id), { source: 'indeed' })).body.data!;
    expect((await mine.owner.get(linksOf(theirs.job.id))).status).toBe(404);
    expect((await mine.owner.post(linksOf(theirs.job.id), { source: 'indeed' })).status).toBe(404);
    expect((await mine.owner.delete(`${linksOf(theirs.job.id)}/${saved.link.id}`)).status).toBe(404);
    expect((await mine.owner.delete(`${linksOf(mine.job.id)}/${saved.link.id}`)).status).toBe(404);
    expect((await theirs.owner.get<TrackedLinkDto[]>(linksOf(theirs.job.id))).body.data).toHaveLength(1);
  });
});
