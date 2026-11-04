import { describe, expect, it } from 'vitest';
import type { ReportAggregateQuery } from '../../report-ports.js';
import { NotFoundError } from '../../errors.js';
import { userActor } from '../../testing/actors.js';
import { ORG_A } from '../../testing/candidate-seed.js';
import { buildClient, seedClientWorld, type TestClientDeps } from '../../testing/client-deps.js';
import { buildJob } from '../../testing/job-fixtures.js';
import { getPublicCareers } from '../jobs/get-public-careers.js';
import { getPublicJob } from '../jobs/get-public-job.js';
import { getPublicFeed } from '../jobs/get-public-site.js';
import { listJobs } from '../jobs/list-jobs.js';
import { getReports } from '../reports/get-reports.js';
import { setJobClient } from './job-client.js';

const recruiter = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
const PERIOD = { from: '2026-01-01T00:00:00Z', to: '2026-06-30T00:00:00Z' };

const world = async (): Promise<TestClientDeps> => {
  const deps = await seedClientWorld({
    jobs: [
      buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') }),
      buildJob({ id: 'job_2', slug: 'accountant', organizationId: ORG_A, status: 'published', publishedAt: new Date('2026-02-02T00:00:00Z') }),
    ],
    clients: [buildClient(), buildClient({ id: 'client_2', name: 'Beta Test' })],
  });
  await setJobClient(deps, recruiter, { jobId: 'job_1', clientId: 'client_1', display: 'confidential' });
  await setJobClient(deps, recruiter, { jobId: 'job_2', clientId: 'client_2' });
  return deps;
};

/** The aggregate query the report ran with. */
const spyAggregate = (deps: TestClientDeps): ReportAggregateQuery[] => {
  const calls: ReportAggregateQuery[] = [];
  const aggregate = deps.reports.aggregate.bind(deps.reports);
  Object.assign(deps, { reports: { ...deps.reports, aggregate: async (query: ReportAggregateQuery) => (calls.push(query), aggregate(query)) } });
  return calls;
};

describe('per-client view', () => {
  it('lists the jobs of one client and names the client of every listed job', async () => {
    const deps = await world();
    const all = await listJobs(deps, recruiter, {});
    expect(all.items.map((job) => job.id).toSorted()).toEqual(['job_1', 'job_2']);
    expect(all.clients).toEqual({ job_1: { id: 'client_1', name: 'Acme Test Client', display: 'confidential' }, job_2: { id: 'client_2', name: 'Beta Test', display: 'named' } });
    const one = await listJobs(deps, recruiter, { clientId: 'client_2' });
    expect(one.items.map((job) => job.id)).toEqual(['job_2']);
    expect((await listJobs(deps, recruiter, { clientId: 'unknown' })).items).toEqual([]);
  });

  it('narrows reports to the jobs of a client, and refuses a job of another client', async () => {
    const deps = await world();
    const calls = spyAggregate(deps);
    const report = await getReports(deps, recruiter, { ...PERIOD, clientId: 'client_1' });
    expect(report.clientId).toBe('client_1');
    expect(calls.at(-1)?.jobIds).toEqual(['job_1']);
    await getReports(deps, recruiter, { ...PERIOD, clientId: 'unknown' });
    expect(calls.at(-1)?.jobIds).toEqual([]);
    expect((await getReports(deps, recruiter, PERIOD)).clientId).toBeNull();
    expect(calls.at(-1)?.jobIds).toBeUndefined();
    await expect(getReports(deps, recruiter, { ...PERIOD, clientId: 'client_1', jobId: 'job_2' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('the client on public pages', () => {
  it('names a shown client with the agency authorization, and never names a confidential one', async () => {
    const deps = await world();
    const named = await getPublicJob(deps, { organizationSlug: 'acme', jobSlug: 'accountant' });
    expect(named.organization.name).toBe('Acme');
    expect(named.job.client).toEqual({ display: 'named', name: 'Beta Test', website: 'https://client.example', logo: null, agencyAuthorization: 'Aut. test 1' });
    const hidden = await getPublicJob(deps, { organizationSlug: 'acme', jobSlug: 'backend' });
    expect(hidden.job.client).toEqual({ display: 'confidential', name: null, website: null, logo: null, agencyAuthorization: 'Aut. test 1' });
    expect(JSON.stringify(hidden)).not.toContain('Acme Test Client');
    const careers = await getPublicCareers(deps, { organizationSlug: 'acme' });
    expect(careers.jobs.map((job) => job.client)).toEqual(expect.arrayContaining([{ display: 'named', name: 'Beta Test' }, { display: 'confidential', name: null }]));
    const feed = await getPublicFeed(deps, { organizationSlug: 'acme' });
    expect(JSON.stringify(feed)).not.toContain('Acme Test Client');
    expect(JSON.stringify(feed)).not.toContain('carla');
  });

  it('shows no client on the ads of an organization without clients', async () => {
    const deps = await seedClientWorld({ agency: false });
    const page = await getPublicJob(deps, { organizationSlug: 'acme', jobSlug: 'backend' });
    expect(page.job).not.toHaveProperty('client');
  });
});
