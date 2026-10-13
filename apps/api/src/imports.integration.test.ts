import type { ConsentRequestDto, ImportBatchDto, ImportBatchPageDto, UndoImportDto } from '@tt/core';
import { schema, eq } from '@tt/db';
import { makeXlsx, makeZip } from '@tt/providers/testing';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, type World } from './testing/candidate-world.js';
import { consentTokenOf, cvPdf, runImportTasks, uploadImport } from './testing/import-world.js';
import { createTestApp, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const ANNA = 'anna.verdi@posta.it';
const BRUNO = 'bruno.neri@posta.it';
const CARLA = 'carla.gialli@posta.it';

const sheet = (): Promise<Uint8Array> =>
  makeXlsx(
    [
      ['Nome', 'Cognome', 'Email', 'Note'],
      ['Anna', 'Verdi', ANNA, 'Colloquio telefonico positivo'],
      ['Neri', 'Bruno', '', ''],
      ['Dario', 'Senzacv', 'dario.senzacv@posta.it', 'Nessun CV'],
    ],
    'Candidati',
  );

const cvZip = (): Uint8Array =>
  zipSync({
    'cv/anna-verdi.pdf': cvPdf('Anna Verdi', ANNA),
    'cv/sub/bruno-neri.pdf': cvPdf('Bruno Neri', BRUNO),
    'cv/carla-gialli.pdf': cvPdf('Carla Gialli', CARLA),
    'cv/readme.txt': strToU8('not a cv'),
  });

async function importFlow(w: World) {
  const response = await uploadImport(t, w.owner, w.job.id, [{ fileName: 'cv.zip', bytes: cvZip() }, { fileName: 'candidati.xlsx', bytes: await sheet() }]);
  expect(response.statusCode).toBe(201);
  const id = (response.json() as { data: { id: string } }).data.id;
  await runImportTasks(t);
  return id;
}

const page = async (w: World, id: string) => (await w.owner.get<ImportBatchPageDto>(`/api/v1/imports/${id}`)).body.data!;
const cards = async (w: World) =>
  (await w.owner.get<{ applications: { id: string; consentStatus: string; candidate: { id: string; firstName: string } }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications;
const searchTotal = async (w: World) => (await w.owner.get<unknown[]>('/api/v1/candidates')).body.meta!.total;
const publicGet = (token: string) => t.app.inject({ method: 'GET', url: `/api/v1/public/consent/${token}` });
const publicPost = (token: string, payload: object) => t.app.inject({ method: 'POST', url: `/api/v1/public/consent/${token}`, headers: { origin: WEB_ORIGIN }, payload });

describe('import: full flow', () => {
  it('analyses, previews, remaps, commits, reconfirms, declines, expires and undoes', async () => {
    const w = await createWorld(t);
    const id = await importFlow(w);

    // Analysis: preview with confidences.
    const preview = await page(w, id);
    expect(preview.batch).toMatchObject({ status: 'ready', counts: { files: 2, cvs: 3, rows: 3, items: 4, included: 3 } });
    const wire = preview.batch as unknown as { job: { id: string; title: string }; createdBy: { id: string; name: string }; columnSamples: Record<string, string[]> };
    expect(wire.job).toEqual({ id: w.job.id, title: 'Backend Developer' });
    expect(wire.createdBy.name).toBe('Owner');
    expect(wire.columnSamples.Nome).toEqual(['Anna', 'Neri', 'Dario']);
    expect(wire.columnSamples.Note).toEqual(['Colloquio telefonico positivo', 'Nessun CV']);
    expect(preview.items.flatMap((item) => item.sources.rows).toSorted()).toEqual([0, 1, 2]);
    expect(preview.batch.mapping).toMatchObject({ firstName: 'Nome', lastName: 'Cognome', email: 'Email', notes: 'Note' });
    const byEmail = (email: string) => preview.items.find((item) => item.candidate.email === email);
    expect(byEmail(ANNA)).toMatchObject({ confidence: 'high', basis: 'email' });
    const bruno = preview.items.find((item) => item.cv?.fileName.includes('bruno'));
    expect(bruno).toMatchObject({ confidence: 'medium', basis: 'name' });
    expect(preview.items.find((item) => item.cv?.fileName.includes('carla'))?.sources.rows).toEqual([]);
    const dario = preview.items.find((item) => item.candidate.lastName === 'Senzacv');
    expect(dario).toMatchObject({ cv: null, included: false, flags: expect.arrayContaining(['no_cv']) });

    // A person without a CV cannot be included.
    const refused = await w.owner.put(`/api/v1/imports/${id}/items`, { items: [{ itemId: dario!.id, included: true }] });
    expect(refused.status).toBe(422);

    // Mapping change reruns the matching: without the email column Anna is paired by name only.
    const remapped = await w.owner.put<ImportBatchPageDto>(`/api/v1/imports/${id}/mapping`, { mapping: { ...preview.batch.mapping, email: null } });
    expect(remapped.status).toBe(200);
    expect(remapped.body.data!.items.find((item) => item.cv?.fileName.includes('anna'))?.basis).toBe('name');
    expect((await w.owner.put(`/api/v1/imports/${id}/mapping`, { mapping: { ...preview.batch.mapping, email: 'Nope' } })).status).toBe(422);
    await w.owner.put(`/api/v1/imports/${id}/mapping`, { mapping: preview.batch.mapping });
    expect((await page(w, id)).items.find((item) => item.cv?.fileName.includes('anna'))?.basis).toBe('email');

    // Commit: pipeline of the job only, not the candidate database.
    expect((await w.owner.post<ImportBatchDto>(`/api/v1/imports/${id}/commit`)).status).toBe(202);
    await runImportTasks(t);
    const batch = (await page(w, id)).batch;
    expect(batch).toMatchObject({ status: 'done', counts: { imported: 3, emailsQueued: 3, failed: 0 } });
    const applications = await cards(w);
    expect(applications.map((card) => card.candidate.firstName).toSorted()).toEqual(['Anna', 'Carla', 'Neri']);
    expect(applications.every((card) => card.consentStatus === 'to_renew')).toBe(true);
    expect(await searchTotal(w)).toBe(0);
    const anna = applications.find((card) => card.candidate.firstName === 'Anna')!;
    // Detail opens only from the pipeline of the import job (the hint); without it, or with a wrong job, the person is
    // hidden: the api adds no hint of its own (#9).
    const detail = await w.owner.get<{ candidate: { consentStatus: string }; applications: unknown[] }>(`/api/v1/candidates/${anna.candidate.id}?viaJobId=${w.job.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ candidate: { consentStatus: 'to_renew' } });
    expect((await w.owner.get(`/api/v1/candidates/${anna.candidate.id}`)).status).toBe(404);
    expect((await w.owner.get(`/api/v1/candidates/${anna.candidate.id}?viaJobId=other_job`)).status).toBe(404);
    const stranger = await createWorld(t, 'Elsewhere');
    expect((await stranger.owner.get(`/api/v1/candidates/${anna.candidate.id}`)).status).toBe(404);
    const pipeline = await w.owner.get<{ applications: { retentionExpiresAt: string }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`);
    expect(new Date(pipeline.body.data!.applications[0]!.retentionExpiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect((await w.owner.post(`/api/v1/imports/${id}/commit`)).status).toBe(409);

    // Reconfirm Anna through the public page.
    const annaToken = await consentTokenOf(w.owner, anna.id);
    const request = await publicGet(annaToken);
    expect(request.statusCode).toBe(200);
    expect(request.headers['cache-control']).toBe('no-store');
    expect((request.json() as { data: ConsentRequestDto }).data).toMatchObject({ job: { title: 'Backend Developer' }, privacyNotice: { version: 1 } });
    expect(request.body).not.toContain(anna.id);
    const given = await publicPost(annaToken, { scopes: ['selection'], privacyNoticeVersion: 1 });
    expect(given.json()).toMatchObject({ success: true, data: { status: 'reconfirmed' } });
    expect(await searchTotal(w)).toBe(1);
    expect((await publicGet(annaToken)).statusCode).toBe(409);
    expect((await publicPost(annaToken, { decline: true })).statusCode).toBe(409);

    // Bruno (the sheet writes his name as "Neri Bruno") declines: erased at once. Carla's link expires: 404.
    const brunoCard = applications.find((card) => card.candidate.firstName === 'Neri')!;
    const declined = await publicPost(await consentTokenOf(w.owner, brunoCard.id), { decline: true });
    expect(declined.json()).toMatchObject({ data: { status: 'declined' } });
    expect((await cards(w)).map((card) => card.candidate.firstName).toSorted()).toEqual(['Anna', 'Carla']);
    const carla = applications.find((card) => card.candidate.firstName === 'Carla')!;
    const carlaToken = await consentTokenOf(w.owner, carla.id);
    await t.handle.db.update(schema.consentToken).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.consentToken.applicationId, carla.id));
    expect((await publicGet(carlaToken)).statusCode).toBe(404);
    expect((await publicGet('x'.repeat(32))).statusCode).toBe(404);

    // Undo removes what is left of the batch, except the person who reconfirmed.
    const undone = await w.owner.post<UndoImportDto>(`/api/v1/imports/${id}/undo`);
    expect(undone.status).toBe(200);
    expect(undone.body.data).toMatchObject({ erased: 1, skippedReconfirmed: 1, failed: 0, batch: { status: 'undone' } });
    expect((await cards(w)).map((card) => card.candidate.firstName)).toEqual(['Anna']);
    expect(await searchTotal(w)).toBe(1);
    expect(t.files.keys().filter((key) => key.includes(`/imports/${id}/`))).toEqual([]);
    const cvKeys = t.files.keys().filter((key) => key.startsWith(`organizations/`) && key.endsWith('/cv'));
    expect(cvKeys.some((key) => key.includes(anna.id))).toBe(true);
    expect(cvKeys.some((key) => key.includes(carla.id) || key.includes(brunoCard.id))).toBe(false);
    expect((await w.owner.post(`/api/v1/imports/${id}/undo`)).status).toBe(409);
  });
});

describe('import: access', () => {
  it('lets owner, admin and recruiter manage imports, and refuses the other roles', async () => {
    const w = await createWorld(t);
    const files = [{ fileName: 'people.csv', bytes: strToU8('Nome;Cognome;Email\nAnna;Verdi;a@posta.it\n') }];
    for (const role of ['admin', 'recruiter']) {
      const member = await w.member(role);
      expect((await uploadImport(t, member, w.job.id, files)).statusCode).toBe(201);
      expect((await member.get('/api/v1/imports')).status).toBe(200);
    }
    for (const role of ['hiring_manager', 'interviewer']) {
      const member = await w.member(role);
      expect((await uploadImport(t, member, w.job.id, files)).statusCode).toBe(403);
      expect((await member.get('/api/v1/imports')).status).toBe(403);
    }
  });

  it('refuses API keys on every import route', async () => {
    const w = await createWorld(t);
    const id = await importFlow(w);
    const key = await createKey(w.owner, ['job:read', 'candidate:read']);
    const headers = { authorization: `Bearer ${key.secret}` };
    for (const [method, url] of [['GET', '/api/v1/imports'], ['GET', `/api/v1/imports/${id}`], ['POST', `/api/v1/imports/${id}/commit`], ['POST', `/api/v1/imports/${id}/undo`]] as const) {
      expect((await t.app.inject({ method, url, headers })).statusCode, `${method} ${url}`).toBe(403);
    }
    const upload = await uploadImport(t, w.owner, w.job.id, [{ fileName: 'a.csv', bytes: strToU8('a;b\n1;2\n') }], { headers: { ...headers, cookie: '' } });
    expect(upload.statusCode).toBe(403);
  });

  it('keeps batches of another organization out of reach', async () => {
    const mine = await createWorld(t);
    const other = await createWorld(t, 'Other');
    const id = await importFlow(mine);
    expect((await other.owner.get(`/api/v1/imports/${id}`)).status).toBe(404);
    expect((await other.owner.post(`/api/v1/imports/${id}/commit`)).status).toBe(404);
    expect((await other.owner.post(`/api/v1/imports/${id}/undo`)).status).toBe(404);
    expect((await other.owner.put(`/api/v1/imports/${id}/items`, { items: [] })).status).toBe(404);
    expect(((await other.owner.get<unknown[]>('/api/v1/imports')).body.data ?? []).length).toBe(0);
    const foreign = await uploadImport(t, other.owner, mine.job.id, [{ fileName: 'a.csv', bytes: strToU8('a;b\n1;2\n') }]);
    expect(foreign.statusCode).toBe(404);
  });
});

describe('import: upload limits', () => {
  it('refuses more than 1000 files', async () => {
    const w = await createWorld(t);
    const many = Array.from({ length: 1001 }, (_, i) => ({ fileName: `f${i}.csv`, bytes: strToU8('a;b\n1;2\n') }));
    expect((await uploadImport(t, w.owner, w.job.id, many)).statusCode).toBe(413);
  });

  it('refuses a big file that is not an archive, and malformed forms', async () => {
    const w = await createWorld(t);
    const big = new Uint8Array(26 * 1024 * 1024).fill(97);
    expect((await uploadImport(t, w.owner, w.job.id, [{ fileName: 'huge.csv', bytes: big }])).statusCode).toBe(413);
    const extra = await uploadImport(t, w.owner, w.job.id, [{ fileName: 'a.csv', bytes: strToU8('a;b\n1;2\n') }], { fields: [{ name: 'jobId', value: w.job.id }, { name: 'stageId', value: 'received' }, { name: 'evil', value: '1' }] });
    expect(extra.statusCode).toBe(422);
    const noJob = await uploadImport(t, w.owner, w.job.id, [{ fileName: 'a.csv', bytes: strToU8('a;b\n1;2\n') }], { fields: [{ name: 'stageId', value: 'received' }] });
    expect(noJob.statusCode).toBe(422);
    const noFiles = await uploadImport(t, w.owner, w.job.id, []);
    expect(noFiles.statusCode).toBe(422);
    const wrongStage = await uploadImport(t, w.owner, w.job.id, [{ fileName: 'a.csv', bytes: strToU8('a;b\n1;2\n') }], { fields: [{ name: 'jobId', value: w.job.id }, { name: 'stageId', value: 'nope' }] });
    expect(wrongStage.statusCode).toBe(422);
  });

  it('accepts a zip bomb and fails its analysis with a reason, storing nothing from it', async () => {
    const w = await createWorld(t);
    const bomb = makeZip([{ name: 'cv/a.pdf', content: 'x', declaredSize: 400 * 1024 * 1024 }]);
    const response = await uploadImport(t, w.owner, w.job.id, [{ fileName: 'bomb.zip', bytes: bomb }]);
    const id = (response.json() as { data: { id: string } }).data.id;
    await runImportTasks(t);
    expect((await page(w, id)).batch).toMatchObject({ status: 'failed', error: 'ratio_exceeded' });
    expect(t.files.keys().filter((key) => key.includes(`/imports/${id}/`))).toEqual([]);
  });

  it('fails the analysis of an archive with an unsafe path', async () => {
    const w = await createWorld(t);
    const evil = makeZip([{ name: '../evil.pdf', content: 'x' }]);
    const id = ((await uploadImport(t, w.owner, w.job.id, [{ fileName: 'evil.zip', bytes: evil }])).json() as { data: { id: string } }).data.id;
    await runImportTasks(t);
    expect((await page(w, id)).batch).toMatchObject({ status: 'failed', error: 'unsafe_path' });
  });
});

describe('import: rate limits', () => {
  it('limits uploads and public consent requests per client', async () => {
    const limited = await createTestApp({ rateLimit: { max: 100_000, authMax: 100_000, publicMax: 100_000, importMax: 2, consentMax: 3 } });
    try {
      const w = await createWorld(limited);
      const file = [{ fileName: 'a.csv', bytes: strToU8('Nome;Email\nA;a@posta.it\n') }];
      const statuses = [];
      for (let i = 0; i < 3; i += 1) statuses.push((await uploadImport(limited, w.owner, w.job.id, file)).statusCode);
      expect(statuses).toEqual([201, 201, 429]);
      const token = 'z'.repeat(32);
      const hits = [];
      for (let i = 0; i < 4; i += 1) hits.push((await limited.app.inject({ method: 'GET', url: `/api/v1/public/consent/${token}` })).statusCode);
      expect(hits).toEqual([404, 404, 404, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('import: documentation', () => {
  it('documents the import routes under the Import tag and the consent routes as public', async () => {
    const doc = (await t.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json() as { paths: Record<string, Record<string, { tags: string[]; security: unknown[] }>> };
    expect(doc.paths['/api/v1/imports']?.post?.tags).toEqual(['Import']);
    expect(doc.paths['/api/v1/imports/{id}/undo']?.post?.tags).toEqual(['Import']);
    expect(doc.paths['/api/v1/public/consent/{token}']?.get?.security).toEqual([]);
  });
});
