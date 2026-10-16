import type { MigrationBatch } from '@candydati/domain';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, type World } from './testing/candidate-world.js';
import { packageZip, runMigrationTasks, uploadMigration } from './testing/migration-world.js';
import { multipartBody } from './testing/multipart.js';
import { createTestApp, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

type Batch = Omit<MigrationBatch, 'createdAt' | 'updatedAt'>;
interface Issue {
  level: string;
  code: string;
  ref: string | null;
  detail: string | null;
}
interface IssuesPage {
  items: Issue[];
  total: number;
  page: number;
  limit: number;
}

const DECLARATIONS = { controller: true, previewChecked: true, processorsOwned: true };

async function uploadReady(w: World): Promise<string> {
  const response = await uploadMigration(t, w.owner);
  expect(response.statusCode).toBe(201);
  const id = (response.json() as { data: { id: string } }).data.id;
  await runMigrationTasks(t);
  return id;
}

const batchOf = async (w: World, id: string) => (await w.owner.get<Batch>(`/api/v1/migrations/${id}`)).body.data!;
const pipelineOf = async (w: World, jobId: string) => (await w.owner.get<{ applications: unknown[] }>(`/api/v1/jobs/${jobId}/pipeline`)).body.data!.applications.length;

describe('migrations: full flow', () => {
  it('uploads, analyses, previews, maps, commits and undoes', async () => {
    const w = await createWorld(t);
    const id = await uploadReady(w);

    const preview = await batchOf(w, id);
    expect(preview).toMatchObject({ status: 'ready', sourceSystem: 'oldats', connectorMaturity: 'package', declarations: null });
    expect(preview.counts).toMatchObject({ jobs: 2, candidates: 2, applications: 2, notes: 1, messages: 1, consentGiven: 1, consentToRenew: 1, consentExpired: 1 });
    expect(preview.counts.perJob).toHaveLength(2);
    expect(JSON.stringify(preview)).not.toContain('packageKey');
    expect(JSON.stringify(preview)).not.toContain('cursor');

    const all = (await w.owner.get<IssuesPage>(`/api/v1/migrations/${id}/issues`)).body.data!;
    expect(all.total).toBeGreaterThan(0);
    const warnings = (await w.owner.get<IssuesPage>(`/api/v1/migrations/${id}/issues?level=warning&limit=1`)).body.data!;
    expect(warnings.items.every((issue) => issue.level === 'warning')).toBe(true);
    expect(warnings.items.map((issue) => issue.code)).toContain('consent_expired');
    expect((await w.owner.get(`/api/v1/migrations/${id}/issues?level=nope`)).status).toBe(422);

    const list = (await w.owner.get<Batch[]>('/api/v1/migrations')).body.data!;
    expect(list.map((batch) => batch.id)).toEqual([id]);

    // Unmapped stages block the confirmation, with their count.
    expect(preview.stageMapping.filter((entry) => entry.type === 'other').length).toBeGreaterThan(0);
    const blocked = await w.owner.post(`/api/v1/migrations/${id}/commit`, { declarations: DECLARATIONS });
    expect(blocked.status).toBe(422);
    expect(JSON.stringify(blocked.body.error)).toMatch(/stages_unmapped:\d+/);

    // One choice by name for every "Applied", and one for a single stage.
    const mapped = await w.owner.put<Batch>(`/api/v1/migrations/${id}/choices`, {
      stageNames: [{ name: 'Applied', type: 'received' }],
      stageMapping: [{ jobRef: 'j2', stageRef: 't2', type: 'technical_interview', title: 'Prova tecnica' }],
      excludedJobs: [],
    });
    expect(mapped.status).toBe(200);
    expect(mapped.body.data!.stageMapping.every((entry) => entry.type !== 'other')).toBe(true);
    expect(mapped.body.data!.stageMapping.find((entry) => entry.stageRef === 't2')).toMatchObject({ title: 'Prova tecnica' });
    expect((await w.owner.put(`/api/v1/migrations/${id}/choices`, { stageNames: [{ name: 'Nowhere', type: 'received' }] })).status).toBe(422);
    expect((await w.owner.put(`/api/v1/migrations/${id}/choices`, { excludedJobs: ['nope'] })).status).toBe(422);

    // Declarations: all three, literally true.
    expect((await w.owner.post(`/api/v1/migrations/${id}/commit`, {})).status).toBe(422);
    expect((await w.owner.post(`/api/v1/migrations/${id}/commit`, { declarations: { ...DECLARATIONS, processorsOwned: false } })).status).toBe(422);
    expect((await w.owner.post(`/api/v1/migrations/${id}/commit`, { declarations: { controller: true, previewChecked: true } })).status).toBe(422);
    expect((await batchOf(w, id)).status).toBe('ready');

    const committed = await w.owner.post<Batch>(`/api/v1/migrations/${id}/commit`, { declarations: DECLARATIONS });
    expect(committed.status).toBe(202);
    expect(committed.body.data).toMatchObject({ status: 'importing', declarations: { controller: true, previewChecked: true, processorsOwned: true } });
    expect((await w.owner.put(`/api/v1/migrations/${id}/choices`, { excludedJobs: [] })).status).toBe(409);
    expect((await w.owner.post(`/api/v1/migrations/${id}/commit`, { declarations: DECLARATIONS })).status).toBe(409);

    await runMigrationTasks(t);
    const done = await batchOf(w, id);
    expect(done.status).toBe('done');
    expect(done.counts.commit).toMatchObject({ jobs: 2, applications: 2, notes: 1, messages: 1 });
    expect(JSON.stringify(done)).not.toContain('cursor');

    // Undo erases what the batch wrote.
    expect((await w.owner.post(`/api/v1/migrations/${id}/undo`, {})).status).toBe(200);
    const again = await w.owner.post(`/api/v1/migrations/${id}/undo`, {});
    expect(again.status).toBe(409);
    expect((await batchOf(w, id)).status).toBe('undone');
    expect(await pipelineOf(w, w.job.id)).toBe(0);
  });

  it('answers the undo with the counts of what was erased and kept', async () => {
    const w = await createWorld(t);
    const id = await uploadReady(w);
    await w.owner.put(`/api/v1/migrations/${id}/choices`, { stageNames: [{ name: 'Applied', type: 'received' }, { name: 'Technical round', type: 'technical_interview' }] });
    expect((await w.owner.post(`/api/v1/migrations/${id}/commit`, { declarations: DECLARATIONS })).status).toBe(202);
    await runMigrationTasks(t);
    const undone = await w.owner.post<{ batch: Batch; counts: Record<string, number> }>(`/api/v1/migrations/${id}/undo`, {});
    expect(undone.body.data).toMatchObject({ batch: { status: 'undone' }, counts: { applicationsErased: 2, candidatesErased: 2, jobsDeleted: 2, failed: 0 } });
  });

  it('leaves a job out of the commit', async () => {
    const w = await createWorld(t);
    const id = await uploadReady(w);
    const mapped = await w.owner.put<Batch>(`/api/v1/migrations/${id}/choices`, {
      stageNames: [{ name: 'Applied', type: 'received' }, { name: 'Technical round', type: 'technical_interview' }],
      excludedJobs: ['j2'],
    });
    expect(mapped.body.data!.excludedJobs).toEqual(['j2']);
    expect((await w.owner.post(`/api/v1/migrations/${id}/commit`, { declarations: DECLARATIONS })).status).toBe(202);
    await runMigrationTasks(t);
    expect((await batchOf(w, id)).counts.commit).toMatchObject({ jobs: 1, applications: 1 });
  });
});

describe('migrations: upload', () => {
  it('fails the analysis of a file that is not a package, with a reason', async () => {
    const w = await createWorld(t);
    const response = await uploadMigration(t, w.owner, zipSync({ 'readme.txt': strToU8('nothing here') }));
    expect(response.statusCode).toBe(201);
    const id = (response.json() as { data: { id: string } }).data.id;
    await runMigrationTasks(t);
    const batch = await batchOf(w, id);
    expect(batch.status).toBe('failed');
    expect(batch.error).toEqual(expect.any(String));
  });

  it('refuses a file that is not a ZIP, a second part and a missing file, storing nothing', async () => {
    const w = await createWorld(t);
    const before = t.files.keys().length;
    expect((await uploadMigration(t, w.owner, strToU8('plain text, not a zip'))).statusCode).toBe(422);
    const extra = multipartBody([{ name: 'file', filename: 'a.zip', bytes: packageZip() }, { name: 'file', filename: 'b.zip', bytes: packageZip() }]);
    const twice = await t.app.inject({ method: 'POST', url: '/api/v1/migrations', headers: { origin: WEB_ORIGIN, cookie: w.owner.cookieHeader(), ...extra.headers }, payload: extra.payload });
    expect([413, 422]).toContain(twice.statusCode);
    const field = multipartBody([{ name: 'evil', value: '1' }]);
    const stray = await t.app.inject({ method: 'POST', url: '/api/v1/migrations', headers: { origin: WEB_ORIGIN, cookie: w.owner.cookieHeader(), ...field.headers }, payload: field.payload });
    expect(stray.statusCode).toBeGreaterThanOrEqual(400);
    expect(t.files.keys().length).toBe(before);
  });
});

describe('migrations: access', () => {
  it('lets owner and admin manage migrations, and refuses every other role', async () => {
    const w = await createWorld(t);
    const admin = await w.member('admin');
    expect((await uploadMigration(t, admin)).statusCode).toBe(201);
    expect((await admin.get('/api/v1/migrations')).status).toBe(200);
    for (const role of ['recruiter', 'hiring_manager', 'interviewer']) {
      const member = await w.member(role);
      expect((await uploadMigration(t, member)).statusCode, role).toBe(403);
      expect((await member.get('/api/v1/migrations')).status, role).toBe(403);
    }
  });

  it('refuses a role without migration:manage with 403 before reading the body', async () => {
    const w = await createWorld(t);
    const member = await w.member('recruiter');
    const response = await t.app.inject({ method: 'POST', url: '/api/v1/migrations', headers: { origin: WEB_ORIGIN, cookie: member.cookieHeader(), 'content-type': 'multipart/form-data; boundary=x' }, payload: 'garbage that never ends' });
    expect(response.statusCode).toBe(403);
  });

  it('refuses API keys on every migration route', async () => {
    const w = await createWorld(t);
    const id = await uploadReady(w);
    const key = await createKey(w.owner, ['job:read', 'candidate:read']);
    const headers = { authorization: `Bearer ${key.secret}` };
    const routes = [
      ['GET', '/api/v1/migrations'],
      ['GET', `/api/v1/migrations/${id}`],
      ['GET', `/api/v1/migrations/${id}/issues`],
      ['PUT', `/api/v1/migrations/${id}/choices`],
      ['POST', `/api/v1/migrations/${id}/commit`],
      ['POST', `/api/v1/migrations/${id}/undo`],
      ['GET', '/api/v1/migrations/connectors'],
      ['POST', '/api/v1/migrations/connector'],
    ] as const;
    for (const [method, url] of routes) expect((await t.app.inject({ method, url, headers })).statusCode, `${method} ${url}`).toBe(403);
    expect((await uploadMigration(t, w.owner, packageZip(), { ...headers, cookie: '' })).statusCode).toBe(403);
  });

  it('keeps migrations of another organization out of reach', async () => {
    const mine = await createWorld(t);
    const other = await createWorld(t, 'Other');
    const id = await uploadReady(mine);
    expect((await other.owner.get(`/api/v1/migrations/${id}`)).status).toBe(404);
    expect((await other.owner.get(`/api/v1/migrations/${id}/issues`)).status).toBe(404);
    expect((await other.owner.put(`/api/v1/migrations/${id}/choices`, { excludedJobs: [] })).status).toBe(404);
    expect((await other.owner.post(`/api/v1/migrations/${id}/commit`, { declarations: DECLARATIONS })).status).toBe(404);
    expect((await other.owner.post(`/api/v1/migrations/${id}/undo`, {})).status).toBe(404);
    expect(((await other.owner.get<unknown[]>('/api/v1/migrations')).body.data ?? []).length).toBe(0);
  });
});

describe('migrations: connectors of a default build', () => {
  it('offers the built-in vendor connectors (beta), never the test one', async () => {
    const w = await createWorld(t);
    const listed = (await w.owner.get<{ id: string; maturity: string }[]>('/api/v1/migrations/connectors')).body.data ?? [];
    expect(listed.map((connector) => [connector.id, connector.maturity])).toEqual([['teamtailor', 'beta'], ['greenhouse', 'beta'], ['workable', 'beta'], ['recruitee', 'beta']]);
  });
});

describe('migrations: documentation', () => {
  it('documents the routes under the Migration tag, session only', async () => {
    const doc = (await t.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json() as { paths: Record<string, Record<string, { tags: string[] }>> };
    expect(doc.paths['/api/v1/migrations']?.post?.tags).toEqual(['Migration']);
    expect(doc.paths['/api/v1/migrations/{id}/commit']?.post?.tags).toEqual(['Migration']);
    expect(Object.keys(doc.paths).filter((path) => path.includes('/migrations'))).toHaveLength(8);
  });
});
