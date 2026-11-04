import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld } from './testing/candidate-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

interface Card {
  id: string;
  outcome: string | null;
  offerAcceptedOn: string | null;
  startOn: string | null;
}
interface Pipeline {
  applications: Card[];
}

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const FAR = '2099-01-01';
const FARTHER = '2099-02-01';

describe('hire dates over the REST api', () => {
  it('records the dates with the hire, edits them afterwards and shows them in the reports', async () => {
    const w = await createWorld(t);
    await w.submit();
    const card = (await w.owner.get<Pipeline>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications[0]!;

    const decided = await w.owner.post<Card>(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired', offerAcceptedOn: FAR, startOn: FARTHER });
    expect(decided.status).toBe(200);
    expect(decided.body.data).toMatchObject({ outcome: 'hired', offerAcceptedOn: FAR, startOn: FARTHER });

    const edited = await w.owner.patch<Card>(`/api/v1/applications/${card.id}/hire-dates`, { startOn: null });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ offerAcceptedOn: FAR, startOn: null });

    const audit = (await w.owner.get<{ action: string }[]>('/api/v1/audit-log')).body.data ?? [];
    expect(audit.some((event) => event.action === 'application.hire_dates_updated')).toBe(true);
  });

  it('refuses a wrong order, a time of day, an empty change and an application that is not hired', async () => {
    const w = await createWorld(t);
    await w.submit();
    const card = (await w.owner.get<Pipeline>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications[0]!;
    expect((await w.owner.patch(`/api/v1/applications/${card.id}/hire-dates`, { startOn: FAR })).status).toBe(409);
    expect((await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'withdrawn', startOn: FAR })).status).toBe(422);
    expect((await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired', offerAcceptedOn: FARTHER, startOn: FAR })).status).toBe(422);
    expect((await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired', startOn: `${FAR}T10:00:00Z` })).status).toBe(422);
    expect((await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired' })).status).toBe(200);
    expect((await w.owner.patch(`/api/v1/applications/${card.id}/hire-dates`, {})).status).toBe(422);
    expect((await w.owner.patch(`/api/v1/applications/${card.id}/hire-dates`, { offerAcceptedOn: '2001-01-01' })).status).toBe(422);
  });

  it('is a person\'s action: a member without the decision permission gets 403', async () => {
    const w = await createWorld(t);
    await w.submit();
    const card = (await w.owner.get<Pipeline>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications[0]!;
    await w.owner.post(`/api/v1/applications/${card.id}/decide`, { outcome: 'hired' });
    const interviewer = await w.member('interviewer');
    expect((await interviewer.patch(`/api/v1/applications/${card.id}/hire-dates`, { startOn: FAR })).status).toBe(403);
  });
});
