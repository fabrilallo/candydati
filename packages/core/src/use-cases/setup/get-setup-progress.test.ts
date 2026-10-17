import { describe, expect, it } from 'vitest';
import { ORG_A, userActor } from '../../testing/index.js';
import { createSetupProgressWorld } from '../../testing/setup-progress-deps.js';
import { getSetupProgress } from './get-setup-progress.js';

const interviewer = userActor({ role: 'interviewer', organizationId: ORG_A });

describe('getSetupProgress', () => {
  it('reports a new organization with nothing set up, to any member', async () => {
    expect(await getSetupProgress(createSetupProgressWorld(), interviewer, {})).toEqual({
      privacyNotice: false, careersPage: false, jobCreated: false, jobPublished: false, team: false,
    });
  });

  it('ticks each step from the real state: notice, published page, a draft, a published or closed job, a second member', async () => {
    const world = createSetupProgressWorld({ activeNotice: true, careersPublished: true, jobs: { draft: 1, published: 0, closed: 0 }, members: 2 });
    expect(await getSetupProgress(world, interviewer, {})).toEqual({ privacyNotice: true, careersPage: true, jobCreated: true, jobPublished: false, team: true });
    const closedOnly = createSetupProgressWorld({ jobs: { draft: 0, published: 0, closed: 1 } });
    expect(await getSetupProgress(closedOnly, interviewer, {})).toMatchObject({ jobCreated: true, jobPublished: true });
  });

  it('reads the organization of the actor only', async () => {
    const world = createSetupProgressWorld({ activeNotice: true });
    await getSetupProgress(world, interviewer, {});
    expect(world.organizationsRead()).toEqual([ORG_A]);
  });
});
