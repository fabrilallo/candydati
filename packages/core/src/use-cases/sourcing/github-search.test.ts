import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, RateLimitedError, SourceUnavailableError, ValidationError } from '../../errors.js';
import { buildCandidate, buildJob, seedSourcingWorld, userActor, ORG_A } from '../../testing/index.js';
import type { GithubPerson, GithubQuery } from '../../sourcing-ports.js';
import { addSourcedContacts, deleteSourcedContact } from './contacts.js';
import { searchGithubPeople } from './github-search.js';

const rita = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const person = (login: string, overrides: Partial<GithubPerson> = {}): GithubPerson => ({
  login, name: `${login} Surname`, location: 'Stockholm', bio: 'Backend engineer, Go and Kubernetes', profileUrl: `https://github.com/${login}`, publicRepos: 20,
  languages: [{ language: 'Go', repos: 12 }, { language: 'Python', repos: 3 }], ...overrides,
});
const world = () =>
  seedSourcingWorld({
    jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published', content: { ...buildJob().content, language: 'en' } })],
    candidates: [buildCandidate({ id: 'cand_9', organizationId: ORG_A, email: 'x@example.com', linkedinUrl: null })],
  });
const withGithub = (people: readonly GithubPerson[], queries: GithubQuery[] = []) => ({ ...world(), github: { search: async (query: GithubQuery) => (queries.push(query), people) } });

describe('searching GitHub for a job', () => {
  it('passes the criteria to GitHub and gives evidence per criterion, never a score', async () => {
    const queries: GithubQuery[] = [];
    const deps = withGithub([person('maja')], queries);
    const [found] = await searchGithubPeople(deps, rita, { jobId: 'job_1', languages: ['Go'], location: 'Stockholm', keywords: ['Kubernetes'], limit: 10 });
    expect(queries).toEqual([{ languages: ['Go'], location: 'Stockholm', keywords: ['Kubernetes'], limit: 10 }]);
    expect(found).toMatchObject({ status: 'new', candidateId: null, person: { login: 'maja' } });
    expect(found?.evidence).toEqual([
      { criterion: 'Go', text: '12 public repositories in Go', where: 'GitHub' },
      { criterion: 'Stockholm', text: 'Stockholm', where: 'GitHub' },
      { criterion: 'Kubernetes', text: 'Backend engineer, Go and Kubernetes', where: 'GitHub bio' },
    ]);
    expect(JSON.stringify(found)).not.toMatch(/score|rank/i);
  });

  it('marks who is already a contact and leaves out who objected', async () => {
    const deps = withGithub([person('maja'), person('bo'), person('cy')]);
    await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ firstName: 'Bo', source: 'github', profileUrl: 'https://github.com/bo' }, { firstName: 'Cy', source: 'github', profileUrl: 'https://github.com/cy' }] });
    const cy = deps.contacts.snapshot().find((c) => c.profileKey === 'github.com/cy');
    await deleteSourcedContact(deps, rita, { contactId: cy!.id, doNotContact: true });
    const found = await searchGithubPeople(deps, rita, { jobId: 'job_1', languages: ['Go'], limit: 10 });
    expect(found.map((f) => [f.person.login, f.status])).toEqual([
      ['maja', 'new'],
      ['bo', 'already_contact'],
    ]);
  });

  it('says when GitHub limits the searches or is down, instead of failing', async () => {
    const limited = { ...world(), github: { search: async () => Promise.reject(Object.assign(new Error('x'), { reason: 'rate_limited' })) } };
    await expect(searchGithubPeople(limited, rita, { jobId: 'job_1', languages: ['Go'] })).rejects.toBeInstanceOf(RateLimitedError);
    const down = { ...world(), github: { search: async () => Promise.reject(new Error('boom')) } };
    await expect(searchGithubPeople(down, rita, { jobId: 'job_1', languages: ['Go'] })).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('needs at least one criterion, GitHub configured and sourcing:manage', async () => {
    await expect(searchGithubPeople(withGithub([]), rita, { jobId: 'job_1', limit: 10 })).rejects.toBeInstanceOf(ValidationError);
    await expect(searchGithubPeople(world(), rita, { jobId: 'job_1', languages: ['Go'] })).rejects.toBeInstanceOf(ConflictError);
    const manager = userActor({ id: 'hm_1', role: 'hiring_manager', organizationId: ORG_A });
    await expect(searchGithubPeople(withGithub([]), manager, { jobId: 'job_1', languages: ['Go'] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
