import type { JobRequest } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../errors.js';
import { ORG_A, seedHrWorld, userActor, type TestHrDeps } from '../../testing/index.js';
import { approveJobRequest, convertJobRequest, rejectJobRequest } from './decisions.js';
import { submitJobRequest } from './requests.js';

const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
const hm = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });
const REQUEST = { title: 'Senior Backend Developer', reason: 'The team grows', salaryMin: 45000, salaryMax: 55000 };

/** A decision that read the request before another one changed it: `findById` keeps returning the stale copy. */
const staleReads = (deps: TestHrDeps, stale: JobRequest): TestHrDeps => ({
  ...deps,
  jobRequests: { ...deps.jobRequests, findById: async () => stale },
});

describe('job request decisions on a stale read (#10)', () => {
  it('an approval and a rejection racing: the second is a conflict and the first decision stays', async () => {
    const deps = seedHrWorld();
    const request = await submitJobRequest(deps, hm, REQUEST);
    await approveJobRequest(deps, owner, { requestId: request.id });
    await expect(rejectJobRequest(staleReads(deps, request), owner, { requestId: request.id, note: 'no' })).rejects.toBeInstanceOf(ConflictError);
    expect(deps.jobRequests.snapshot()[0]).toMatchObject({ status: 'approved', decisionNote: null });
    expect(deps.auditLog.events().map((e) => e.action)).not.toContain('job_request.rejected');
  });

  it('two approvals racing: only one is recorded', async () => {
    const deps = seedHrWorld();
    const request = await submitJobRequest(deps, hm, REQUEST);
    await approveJobRequest(deps, owner, { requestId: request.id, note: 'first' });
    await expect(approveJobRequest(staleReads(deps, request), owner, { requestId: request.id, note: 'second' })).rejects.toBeInstanceOf(ConflictError);
    expect(deps.jobRequests.snapshot()[0]?.decisionNote).toBe('first');
  });

  it('a double convert creates exactly one job', async () => {
    const deps = seedHrWorld();
    const request = await submitJobRequest(deps, hm, REQUEST);
    const before = deps.jobs.snapshot().length;
    await convertJobRequest(deps, hm, { requestId: request.id });
    await expect(convertJobRequest(staleReads(deps, request), hm, { requestId: request.id })).rejects.toBeInstanceOf(ConflictError);
    expect(deps.jobs.snapshot()).toHaveLength(before + 1);
    expect(deps.auditLog.events().filter((e) => e.action === 'job.created')).toHaveLength(1);
  });
});
