import {
  createDrizzleApplications,
  createDrizzleCandidates,
  createDrizzleJobs,
  createDrizzleResponsePromises,
  createDrizzleStageEvents,
} from '@candydati/core';
import { expectedReports, REPORT_FROM, REPORT_NOW, REPORT_TO, seedReportDataset, type DatasetIds } from '@candydati/core/testing';
import { schema } from '@candydati/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, withKey } from './testing/api-keys.js';
import { createWorld, personForm } from './testing/candidate-world.js';
import { TestUser } from './testing/client.js';
import { createTestApp, uniqueEmail, type TestApp } from './testing/test-app.js';

const PERIOD = `from=${REPORT_FROM.toISOString()}&to=${REPORT_TO.toISOString()}`;
const URL = `/api/v1/reports?${PERIOD}`;
const CSV_URL = `/api/v1/reports/export.csv?${PERIOD}`;

let t: TestApp;
let owner: TestUser;
let ids: DatasetIds;
beforeAll(async () => {
  t = await createTestApp({ reportClock: () => REPORT_NOW });
  owner = await new TestUser(t.app, uniqueEmail('reports-owner'), 'Owner').signUp();
  const organizationId = await owner.createOrganization('Reports');
  const { db } = t.handle;
  ids = await seedReportDataset(
    {
      jobs: createDrizzleJobs(db),
      candidates: createDrizzleCandidates(db),
      applications: createDrizzleApplications(db),
      stageEvents: createDrizzleStageEvents(db),
      promises: createDrizzleResponsePromises(db),
    },
    organizationId,
    'http',
  );
});
afterAll(async () => {
  await t.close();
});

const member = async (role: string): Promise<TestUser> => new TestUser(t.app, uniqueEmail(role), role).signUp().then((user) => user.joinAs(owner, role));

describe('GET /api/v1/reports', () => {
  it('answers 401 to anonymous callers', async () => {
    expect((await new TestUser(t.app, uniqueEmail('anon'), 'Anon').get(URL)).status).toBe(401);
  });

  it('returns exactly the numbers of the seeded dataset', async () => {
    const reply = await owner.get(URL);
    expect(reply.status).toBe(200);
    expect(reply.body.data).toEqual(JSON.parse(JSON.stringify(expectedReports(ids))));
  });

  it('narrows to one job, refuses a bad period and hides a foreign job', async () => {
    const one = await owner.get<{ jobId: string; funnel: { outcomes: unknown } }>(`${URL}&jobId=${ids.frontend}`);
    expect(one.body.data).toMatchObject({ jobId: ids.frontend, funnel: { outcomes: { hired: 1, not_selected: 0, withdrawn: 0 } } });
    expect((await owner.get(`/api/v1/reports?from=${REPORT_TO.toISOString()}&to=${REPORT_FROM.toISOString()}`)).status).toBe(422);
    expect((await owner.get('/api/v1/reports')).status).toBe(422);
    expect((await owner.get(`${URL}&jobId=does-not-exist`)).status).toBe(404);
  });

  it('allows owner, admin, recruiter and hiring manager, refuses the interviewer', async () => {
    for (const role of ['admin', 'recruiter', 'hiring_manager']) expect((await (await member(role)).get(URL)).status).toBe(200);
    expect((await (await member('interviewer')).get(URL)).status).toBe(403);
  });

  it('never shows another organization the dataset', async () => {
    const other = await new TestUser(t.app, uniqueEmail('reports-other'), 'Other').signUp();
    await other.createOrganization('Elsewhere');
    const reply = await other.get<{ sources: unknown[]; funnel: { outcomes: unknown } }>(URL);
    expect(reply.status).toBe(200);
    expect(reply.body.data).toMatchObject({ sources: [], funnel: { outcomes: { hired: 0, not_selected: 0, withdrawn: 0 } } });
    expect((await other.get(`${URL}&jobId=${ids.backend}`)).status).toBe(404);
  });

  it('serves an API key with report:read and refuses one without', async () => {
    const allowed = await createKey(owner, ['report:read']);
    const reply = await withKey<{ sources: unknown[] }>(t.app, allowed.secret, 'GET', URL);
    expect(reply.status).toBe(200);
    expect(reply.body.data!.sources).toHaveLength(5);
    const other = await createKey(owner, ['job:read']);
    expect((await withKey(t.app, other.secret, 'GET', URL)).status).toBe(403);
  });
});

describe('GET /api/v1/reports/export.csv', () => {
  it('sends one attachment with a block per section and no personal data', async () => {
    const response = await t.app.inject({ method: 'GET', url: CSV_URL, headers: { cookie: owner.cookieHeader() } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toMatch(/^attachment;.*reports-2026-06-01_2026-06-30\.csv/);
    for (const name of ['period', 'time_to_hire_days', 'time_to_fill_days', 'funnel', 'outcomes', 'sources', 'responses', 'response_time_hours', 'outcome_coverage']) {
      expect(response.body).toContain(`# ${name}`);
    }
    expect(response.body).toContain('linkedin,4,3');
    expect(response.body).not.toMatch(/@example\.org/);
  });

  it('applies the same permission', async () => {
    expect((await (await member('interviewer')).get(CSV_URL)).status).toBe(403);
    const key = await createKey(owner, ['report:read']);
    const reply = await t.app.inject({ method: 'GET', url: CSV_URL, headers: { authorization: `Bearer ${key.secret}` } });
    expect(reply.statusCode).toBe(200);
  });
});

describe('origin of a public application', () => {
  it('stores a sanitized origin and refuses nothing because of it', async () => {
    const w = await createWorld(t, 'Origins');
    const cases: readonly [unknown, string][] = [
      ['utm_source=LinkedIn Ads!!', 'utm_source-linkedin-ads'],
      ['LinkedIn', 'linkedin'],
      [`x${'y'.repeat(200)}`, `x${'y'.repeat(59)}`],
      [{ nope: true }, 'direct'],
      [undefined, 'direct'],
    ];
    for (const [origin, expected] of cases) {
      const email = uniqueEmail('origin');
      const reply = await w.submit(personForm({ email, ...(origin === undefined ? {} : { origin }) }));
      expect(reply.statusCode).toBe(201);
      const [candidate] = await t.handle.db.select().from(schema.candidate).where(eq(schema.candidate.email, email));
      const [application] = await t.handle.db.select().from(schema.application).where(eq(schema.application.candidateId, candidate!.id));
      expect(application!.origin).toBe(expected);
    }
  });
});
