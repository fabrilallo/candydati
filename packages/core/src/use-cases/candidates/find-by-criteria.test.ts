import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../errors.js';
import { buildApplication, buildCandidate, buildExtraction, seedCandidateWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { findCandidatesByCriteria } from './find-by-criteria.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
const cv = { headline: 'Dev', location: 'Torino', yearsOfExperience: 2, experiences: [], education: [], skills: ['Vue'], languages: [] };

const world = () =>
  seedCandidateWorld({
    candidates: [
      buildCandidate({ id: 'c_vue', organizationId: ORG_A, email: 'a@x.it', firstName: 'Ada' }),
      buildCandidate({ id: 'c_go', organizationId: ORG_A, email: 'b@x.it', firstName: 'Bo' }),
      buildCandidate({ id: 'c_unread', organizationId: ORG_A, email: 'c@x.it' }),
    ],
    applications: [
      buildApplication({ id: 'app_vue', candidateId: 'c_vue', organizationId: ORG_A }),
      buildApplication({ id: 'app_go', candidateId: 'c_go', organizationId: ORG_A }),
      buildApplication({ id: 'app_unread', candidateId: 'c_unread', organizationId: ORG_A }),
    ],
    extractions: [
      buildExtraction({ applicationId: 'app_vue', organizationId: ORG_A, data: cv, text: 'Vue' }),
      buildExtraction({ applicationId: 'app_go', organizationId: ORG_A, data: { ...cv, skills: ['Go'] }, text: 'Go' }),
      buildExtraction({ applicationId: 'app_unread', organizationId: ORG_A, status: 'failed', text: null, data: null }),
    ],
  });

describe('findCandidatesByCriteria', () => {
  it('lists who meets every criterion, with the criteria in words and how many could not be checked', async () => {
    const result = await findCandidatesByCriteria(world(), recruiter, { jobId: 'job_1', criteria: { skills: ['vue'] } });
    expect(result.items.map((item) => [item.candidate.id, item.applicationId])).toEqual([['c_vue', 'app_vue']]);
    expect(result).toMatchObject({ job: { id: 'job_1' }, criteria: ['skill: vue'], pool: 'both', total: 1, notEvaluable: 1, page: 1, limit: 25 });
  });

  it('records the search, its criteria and the count in the audit log, never who was found', async () => {
    const deps = world();
    await findCandidatesByCriteria(deps, recruiter, { jobId: 'job_1', criteria: { skills: ['Vue'], minYearsOfExperience: 1 }, pool: 'applicants' });
    const [event] = deps.auditLog.events();
    expect(event).toMatchObject({
      action: 'candidate.searched_by_criteria',
      target: { type: 'job', id: 'job_1' },
      metadata: { criteria: ['skill: Vue', 'at least 1 years of experience'], pool: 'applicants', total: 1 },
    });
    expect(JSON.stringify(event)).not.toMatch(/c_vue|Ada/);
  });

  it('refuses empty or discriminatory criteria and a maximum experience', async () => {
    for (const criteria of [{}, { keywords: ['giovane'] }, { skills: ['Vue'], maxYearsOfExperience: 5 }]) {
      await expect(findCandidatesByCriteria(world(), recruiter, { jobId: 'job_1', criteria })).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('is not found for a job of another organization', async () => {
    const foreign = userActor({ role: 'owner', organizationId: ORG_B });
    await expect(findCandidatesByCriteria(world(), foreign, { jobId: 'job_1', criteria: { skills: ['Vue'] } })).rejects.toBeInstanceOf(NotFoundError);
  });
});
