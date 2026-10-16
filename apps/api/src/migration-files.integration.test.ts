import { fetchMigration, type MigrationFetchDeps } from '@candydati/core';
import { BUILT_IN_MIGRATION_CONNECTORS, createConnectorRegistry, createMigrationFetcher, createSecretBox } from '@candydati/providers';
import { createFakeConnector, makePdf } from '@candydati/providers/testing';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, type World } from './testing/candidate-world.js';
import type { TestUser } from './testing/client.js';
import { migrationWorkerDeps, runMigrationTasks } from './testing/migration-world.js';
import { multipartBody } from './testing/multipart.js';
import { createTestApp, testEnv, WEB_ORIGIN, type TestApp } from './testing/test-app.js';

const registry = createConnectorRegistry([...BUILT_IN_MIGRATION_CONNECTORS, createFakeConnector()]);

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ migrationConnectors: registry });
});
afterAll(async () => {
  await t.close();
});

const SHEET = [
  'Nome;Cognome;Email;Annuncio;Fase;Data candidatura;Esito;Valutazione;Taglia scarpe',
  'Ada;Bianchi;ada.files@example.com;Backend Developer;Colloquio HR;14/03/2025;Scartato;4;42',
  'Bruno;Verdi;bruno.files@example.com;Backend Developer;Offerta;02/04/2025;Assunto;5;44',
].join('\n');
const cvZip = (): Uint8Array => zipSync({ 'Ada Bianchi.pdf': makePdf(['Ada Bianchi', 'Backend Developer', 'ada.files@example.com']) });

const URL = '/api/v1/migrations/connector/inrecruiting/files';
type Part = Parameters<typeof multipartBody>[0][number];
const sheetPart = (text: string = SHEET): Part => ({ name: 'sheet', filename: 'export.csv', bytes: strToU8(text), contentType: 'text/csv' });
const cvsPart = (bytes: Uint8Array = cvZip()): Part => ({ name: 'cvs', filename: 'cvs.zip', bytes, contentType: 'application/zip' });

function upload(user: TestUser, parts: readonly Part[], url = URL, headers: Record<string, string> = {}) {
  const { payload, headers: form } = multipartBody(parts);
  return t.app.inject({ method: 'POST', url, headers: { origin: WEB_ORIGIN, cookie: user.cookieHeader(), ...form, ...headers }, payload });
}

function fetchDeps(): MigrationFetchDeps {
  const analysis = migrationWorkerDeps(t).analysis;
  return { ...analysis, sources: registry, secrets: createSecretBox(testEnv().BETTER_AUTH_SECRET), fetcher: createMigrationFetcher({ registry, files: t.files }), progressIntervalMs: 0 };
}

const uploadsOf = () => t.files.keys().filter((key) => key.includes('/upload/'));
const jobFor = (id: string) => t.queue.jobs().find((job) => job.name === 'migration.fetch' && (job.payload as { batchId: string }).batchId === id)?.payload as { organizationId: string; batchId: string };
const auditOf = async (id: string) => (await t.handle.pool.query<{ action: string; metadata: unknown }>('select action, metadata from audit_log where target_id = $1 order by occurred_at', [id])).rows;

async function started(w: World, parts: readonly Part[] = [sheetPart(), cvsPart()]): Promise<string> {
  const response = await upload(w.owner, parts);
  expect(response.statusCode, response.body).toBe(201);
  return (response.json() as { data: { id: string } }).data.id;
}

describe('migration from an uploaded export (file-based connector)', () => {
  it('lists the connector as a beta file connector with no credential fields', async () => {
    const w = await createWorld(t);
    const listed = await w.owner.get<Record<string, unknown>[]>('/api/v1/migrations/connectors');
    expect(listed.body.data).toContainEqual(expect.objectContaining({ id: 'inrecruiting', maturity: 'beta', input: 'files', fields: [] }));
  });

  it('stores both files under the batch, starts fetching without credentials, then fetches into a ready preview and deletes the files', async () => {
    const w = await createWorld(t);
    const before = uploadsOf().length;
    const id = await started(w);
    expect(uploadsOf()).toHaveLength(before + 2);
    const sealed = await t.handle.pool.query<{ c: string | null }>('select credentials_ciphertext as c from migration_batch where id = $1', [id]);
    expect(sealed.rows[0]?.c).toBeNull();
    expect((await w.owner.get<Record<string, unknown>>(`/api/v1/migrations/${id}`)).body.data).toMatchObject({ status: 'fetching', sourceSystem: 'inrecruiting', connectorMaturity: 'beta' });

    expect(await fetchMigration(fetchDeps(), jobFor(id))).toBe('fetched');
    expect(uploadsOf()).toHaveLength(before);
    await runMigrationTasks(t);
    const ready = (await w.owner.get<{ status: string; counts: Record<string, unknown> }>(`/api/v1/migrations/${id}`)).body.data!;
    expect(ready).toMatchObject({ status: 'ready', producer: 'connector:inrecruiting@1', counts: { jobs: 1, applications: 2, fetch: { parts: 1 } } });
    expect((ready.counts.fetch as { notices: unknown[] }).notices).toEqual([
      { code: 'columns_unrecognized', count: 1, headers: ['Taglia scarpe'] },
      { code: 'columns_ignored', count: 1, headers: ['Valutazione'] },
    ]);
    expect(JSON.stringify(ready)).not.toContain('"upload"');
    const audit = await auditOf(id);
    expect(audit.find((row) => row.action === 'migration.created')?.metadata).toEqual({ connectorId: 'inrecruiting', maturity: 'beta', sheetBytes: SHEET.length, cvsBytes: cvZip().byteLength });
    expect(audit.map((row) => row.action)).toContain('migration.fetched');
  });

  it('works with the spreadsheet alone', async () => {
    const w = await createWorld(t);
    const id = await started(w, [sheetPart()]);
    expect(await fetchMigration(fetchDeps(), jobFor(id))).toBe('fetched');
    await runMigrationTasks(t);
    expect((await w.owner.get<{ status: string }>(`/api/v1/migrations/${id}`)).body.data?.status).toBe('ready');
  });

  it('fails readably when the columns are missing, and still deletes the files', async () => {
    const w = await createWorld(t);
    const before = uploadsOf().length;
    const id = await started(w, [sheetPart('Email;Stato\na@example.com;Nuovo'), cvsPart()]);
    expect(await fetchMigration(fetchDeps(), jobFor(id))).toBe('failed');
    expect((await w.owner.get<Record<string, unknown>>(`/api/v1/migrations/${id}`)).body.data).toMatchObject({ status: 'failed', error: 'input_columns_missing' });
    expect(uploadsOf()).toHaveLength(before);
  });

  it('refuses what it cannot take and leaves nothing in storage', async () => {
    const w = await createWorld(t);
    const before = t.files.keys().length;
    const refusal = async (parts: readonly Part[], url = URL) => (await upload(w.owner, parts, url)).statusCode;
    expect(await refusal([cvsPart()])).toBe(422);
    expect(await refusal([sheetPart('')])).toBe(422);
    expect(await refusal([{ name: 'sheet', filename: 'x.pdf', bytes: Uint8Array.from([0x25, 0x50, 0, 1, 2]) }])).toBe(422);
    expect(await refusal([sheetPart(), cvsPart(strToU8('not a zip'))])).toBe(422);
    expect(await refusal([sheetPart(), sheetPart()])).toBeGreaterThanOrEqual(400);
    expect(await refusal([sheetPart(), { name: 'other', filename: 'o.zip', bytes: cvZip() }])).toBe(422);
    expect(await refusal([sheetPart(), { name: 'evil', value: '1' }])).toBeGreaterThanOrEqual(400);
    expect(await refusal([sheetPart(), cvsPart(), { name: 'third', filename: 't.zip', bytes: cvZip() }])).toBeGreaterThanOrEqual(400);
    expect(await refusal([sheetPart()], '/api/v1/migrations/connector/nope/files')).toBe(422);
    expect(await refusal([sheetPart()], '/api/v1/migrations/connector/fake-ats/files')).toBe(422);
    expect(t.files.keys().length).toBe(before);
    expect(((await w.owner.get<unknown[]>('/api/v1/migrations')).body.data ?? []).length).toBe(0);
  });

  it('refuses the credentials route for a file connector, and the upload route for an API connector', async () => {
    const w = await createWorld(t);
    const credentialsRoute = await w.owner.post('/api/v1/migrations/connector', { connectorId: 'inrecruiting', credentials: {} });
    expect(credentialsRoute.status).toBe(422);
    expect(JSON.stringify(credentialsRoute.body)).toContain('connector_needs_files');
  });

  it('is for owners and admins with a session: recruiters and API keys are refused before the body is read', async () => {
    const w = await createWorld(t);
    const before = t.files.keys().length;
    const recruiter = await w.member('recruiter');
    expect((await upload(recruiter, [sheetPart(), cvsPart()])).statusCode).toBe(403);
    expect((await upload(await w.member('admin'), [sheetPart()])).statusCode).toBe(201);
    const key = await createKey(w.owner, ['job:read']);
    const { payload, headers } = multipartBody([sheetPart()]);
    const withKey = await t.app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${key.secret}`, ...headers }, payload });
    expect(withKey.statusCode).toBe(403);
    const noCookie = await upload(w.owner, [sheetPart()], URL, { cookie: '' });
    expect(noCookie.statusCode).toBe(401);
    // the admin's upload is the only thing stored
    expect(t.files.keys().length).toBe(before + 1);
  });

  it('documents the upload as multipart, session only', async () => {
    const doc = (await t.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json() as { paths: Record<string, Record<string, { tags: string[]; requestBody?: { content: Record<string, unknown> } }>> };
    const post = doc.paths['/api/v1/migrations/connector/{connectorId}/files']?.post;
    expect(post?.tags).toEqual(['Migration']);
    expect(Object.keys(post?.requestBody?.content ?? {})).toEqual(['multipart/form-data']);
  });
});
