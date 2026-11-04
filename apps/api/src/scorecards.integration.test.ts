import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { World } from './testing/candidate-world.js';
import { applyAs, createWorld } from './testing/privacy-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ criteriaDrafter: { available: () => true, draft: async () => ({ criteria: ['Postgres experience', 'English B2', 'Client communication'] }) } });
});
afterAll(async () => {
  await t.close();
});

interface Scorecard {
  criteria: { id: string; label: string; stageId: string | null; locked: boolean }[];
}
interface Row {
  label: string;
  entries: { interviewerName: string; observation: string; evidence: string }[];
}

const anonymous = (method: 'GET' | 'POST', url: string, payload?: object) => t.app.inject({ method, url, ...(payload ? { payload } : {}) });
const tokenFromMail = (to: string): string => /\/feedback\/([a-z0-9]+)/.exec(t.emailSender.sent().filter((m) => m.to === to).at(-1)?.text ?? '')![1]!;

async function declaredStage(w: World): Promise<string> {
  const board = await w.owner.get<{ stages: { id: string; declared: unknown }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`);
  return board.body.data!.stages.find((s) => s.declared !== null)!.id;
}

describe('scorecards without scores over HTTP', () => {
  it('declares criteria, drafts more from the ad, shows them on the form without login and side by side on the candidate', async () => {
    const w = await createWorld(t);
    const stageId = await declaredStage(w);
    const email = `eva-${randomUUID().slice(0, 8)}@example.com`;
    const set = await w.owner.put<Scorecard>(`/api/v1/jobs/${w.job.id}/scorecard`, { criteria: [{ label: 'Postgres experience' }, { label: 'English B2', stageId }] });
    expect(set.status).toBe(200);
    expect(set.body.data!.criteria.map((c) => [c.label, c.stageId, c.locked])).toEqual([['Postgres experience', null, false], ['English B2', stageId, false]]);
    expect((await w.owner.put(`/api/v1/jobs/${w.job.id}/scorecard`, { criteria: [{ label: 'Postgres', weight: 3 }] })).status).toBe(422);

    const drafted = await w.owner.post<{ status: string; criteria: string[] }>(`/api/v1/jobs/${w.job.id}/scorecard/suggest`);
    expect(drafted.body.data).toEqual({ status: 'proposed', criteria: ['Client communication'] });

    await w.owner.put(`/api/v1/jobs/${w.job.id}/interviewers`, { stages: [{ stageId, interviewers: [{ kind: 'external', name: 'Eva External', email }] }] });
    const applied = await applyAs(w);
    await w.owner.post(`/api/v1/applications/${applied.applicationId}/move`, { stageId });
    const token = tokenFromMail(email);
    const form = (await anonymous('GET', `/api/v1/public/feedback/${token}`)).json().data as { criteria: { id: string; label: string }[]; questions: { id: string }[]; observations: string[] };
    expect(form.criteria.map((c) => c.label)).toEqual(['Postgres experience', 'English B2']);
    expect(form.observations).toEqual(['observed', 'not_observed', 'to_explore']);

    const answers = Object.fromEntries(form.questions.map((q) => [q.id, `Risposta ${q.id}`]));
    const [pg, en] = form.criteria;
    const rated = await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers, recommendation: 'proceed', observations: [{ criterionId: pg!.id, observation: 'observed', evidence: 'x', rating: 5 }] });
    expect(rated.statusCode).toBe(422);
    const missing = await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers, recommendation: 'proceed', observations: [] });
    expect(missing.statusCode).toBe(422);
    const observations = [
      { criterionId: pg!.id, observation: 'observed', evidence: 'Tuned a slow query on a real schema' },
      { criterionId: en!.id, observation: 'to_explore', evidence: 'Short answers only' },
    ];
    expect((await anonymous('POST', `/api/v1/public/feedback/${token}`, { answers, recommendation: 'proceed', observations })).statusCode).toBe(200);

    const shown = (await w.owner.get<{ scorecard: Row[] }>(`/api/v1/applications/${applied.applicationId}/feedback`)).body.data!;
    expect(shown.scorecard.map((row) => [row.label, row.entries.map((e) => [e.interviewerName, e.observation, e.evidence])])).toEqual([
      ['Postgres experience', [['Eva External', 'observed', 'Tuned a slow query on a real schema']]],
      ['English B2', [['Eva External', 'to_explore', 'Short answers only']]],
    ]);
    const locked = (await w.owner.get<Scorecard>(`/api/v1/jobs/${w.job.id}/scorecard`)).body.data!.criteria;
    expect(locked.every((c) => c.locked)).toBe(true);
    expect((await w.owner.put(`/api/v1/jobs/${w.job.id}/scorecard`, { criteria: [{ id: pg!.id, label: 'Renamed' }] })).status).toBe(422);
  });
});
