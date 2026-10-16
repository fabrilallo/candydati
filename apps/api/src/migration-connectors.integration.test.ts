import { fetchMigration, type MigrationFetchDeps } from '@candydati/core';
import { createConnectorRegistry, createMigrationFetcher, createSecretBox } from '@candydati/providers';
import { createFakeConnector } from '@candydati/providers/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey } from './testing/api-keys.js';
import { createWorld, type World } from './testing/candidate-world.js';
import { migrationWorkerDeps, runMigrationTasks } from './testing/migration-world.js';
import { createTestApp, testEnv, type TestApp } from './testing/test-app.js';

const registry = createConnectorRegistry([createFakeConnector({ jobs: 2, perJob: 2 })]);
const SECRET_KEY = 'sk_live_never_shown_7f3a9c';
const credentials = { apiKey: SECRET_KEY, subdomain: 'acme' };

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ migrationConnectors: registry });
});
afterAll(async () => {
  await t.close();
});

interface Started {
  id: string;
  status: string;
}

/** What the worker does for `migration.fetch`, against the test database, with the same secret as the api. */
function fetchDeps(): MigrationFetchDeps {
  const analysis = migrationWorkerDeps(t).analysis;
  return { ...analysis, sources: registry, secrets: createSecretBox(testEnv().BETTER_AUTH_SECRET), fetcher: createMigrationFetcher({ registry, files: t.files }), progressIntervalMs: 0 };
}

const sealedOf = async (id: string) => (await t.handle.pool.query<{ c: string | null }>('select credentials_ciphertext as c from migration_batch where id = $1', [id])).rows[0]?.c ?? null;
const auditOf = async (id: string) => (await t.handle.pool.query<{ action: string; metadata: unknown }>("select action, metadata from audit_log where target_id = $1 order by occurred_at", [id])).rows;

async function start(w: World) {
  return w.owner.post<Started>('/api/v1/migrations/connector', { connectorId: 'fake-ats', credentials });
}

describe('migration connectors', () => {
  it('lists the connectors without any credential schema', async () => {
    const w = await createWorld(t);
    const listed = await w.owner.get<Record<string, unknown>[]>('/api/v1/migrations/connectors');
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({ id: 'fake-ats', label: 'Fake ATS', maturity: 'beta', input: 'api', docsUrl: 'https://docs.example.com/fake-ats', fields: expect.arrayContaining([expect.objectContaining({ name: 'apiKey', type: 'password', secret: true })]) }),
    ]);
    expect(listed.body.data?.[0]).not.toHaveProperty('credentials');
  });

  it('starts a fetch, seals the key, never echoes it, then fetches into a ready preview and wipes the key', async () => {
    const w = await createWorld(t);
    const started = await start(w);
    expect(started.status).toBe(201);
    expect(started.body.data).toEqual({ id: expect.any(String), status: 'fetching' });
    expect(JSON.stringify(started.body)).not.toContain(SECRET_KEY);
    const id = started.body.data!.id;
    const sealed = await sealedOf(id);
    expect(sealed?.startsWith('sb1.')).toBe(true);
    expect(sealed).not.toContain(SECRET_KEY);
    expect(t.queue.jobs().filter((job) => job.name === 'migration.fetch').map((job) => job.payload)).toContainEqual({ organizationId: expect.any(String), batchId: id });
    const fetching = await w.owner.get<Record<string, unknown>>(`/api/v1/migrations/${id}`);
    expect(fetching.body.data).toMatchObject({ status: 'fetching', sourceSystem: 'fake-ats', connectorMaturity: 'beta', groupId: id, part: 1, counts: { fetch: { done: 0, total: null } } });

    const organizationId = (t.queue.jobs().find((job) => job.name === 'migration.fetch' && (job.payload as { batchId: string }).batchId === id)?.payload as { organizationId: string }).organizationId;
    expect(await fetchMigration(fetchDeps(), { organizationId, batchId: id })).toBe('fetched');
    expect(await sealedOf(id)).toBeNull();
    await runMigrationTasks(t);
    const ready = await w.owner.get<Record<string, unknown>>(`/api/v1/migrations/${id}`);
    expect(ready.body.data).toMatchObject({ status: 'ready', producer: 'connector:fake-ats@1', connectorMaturity: 'beta', counts: { jobs: 2, applications: 4, fetch: { done: 4, total: 4, parts: 1 } } });
    expect(JSON.stringify(ready.body)).not.toContain('reservedFiles');

    const audit = await auditOf(id);
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(['migration.created', 'migration.fetched']));
    expect(audit.find((row) => row.action === 'migration.created')?.metadata).toEqual({ connectorId: 'fake-ats', maturity: 'beta' });
    expect(JSON.stringify(audit)).not.toContain(SECRET_KEY);
    const queued = JSON.stringify(t.queue.jobs());
    expect(queued).not.toContain(SECRET_KEY);
  });

  it('refuses bad credentials naming the field only, and an unknown connector, storing nothing', async () => {
    const w = await createWorld(t);
    const bad = await w.owner.post('/api/v1/migrations/connector', { connectorId: 'fake-ats', credentials: { apiKey: 'tiny-x', subdomain: 'acme' } });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).toContain('credentials.apiKey');
    expect(JSON.stringify(bad.body)).not.toContain('tiny-x');
    const unknown = await w.owner.post('/api/v1/migrations/connector', { connectorId: 'nope', credentials });
    expect(unknown.status).toBe(422);
    expect(JSON.stringify(unknown.body)).toContain('connector_unknown');
    expect(JSON.stringify(unknown.body)).not.toContain(SECRET_KEY);
    const malformed = await w.owner.post('/api/v1/migrations/connector', { connectorId: 'fake-ats', credentials: { apiKey: 42 } });
    expect(malformed.status).toBe(422);
    expect(((await w.owner.get<unknown[]>('/api/v1/migrations')).body.data ?? []).length).toBe(0);
  });

  it('is for owners and admins with a session: recruiters and API keys are refused', async () => {
    const w = await createWorld(t);
    const recruiter = await w.member('recruiter');
    expect((await recruiter.post('/api/v1/migrations/connector', { connectorId: 'fake-ats', credentials })).status).toBe(403);
    expect((await recruiter.get('/api/v1/migrations/connectors')).status).toBe(403);
    const key = await createKey(w.owner, ['job:read']);
    const headers = { authorization: `Bearer ${key.secret}`, 'content-type': 'application/json' };
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/migrations/connectors', headers })).statusCode).toBe(403);
    const posted = await t.app.inject({ method: 'POST', url: '/api/v1/migrations/connector', headers, payload: JSON.stringify({ connectorId: 'fake-ats', credentials }) });
    expect(posted.statusCode).toBe(403);
    expect(posted.body).not.toContain(SECRET_KEY);
  });

  it('fails a fetch the source refuses, and wipes the key all the same', async () => {
    const refusing = createConnectorRegistry([createFakeConnector({ failWith: 'credentials_refused' })]);
    const w = await createWorld(t);
    const id = (await start(w)).body.data!.id;
    const organizationId = (t.queue.jobs().find((job) => (job.payload as { batchId?: string }).batchId === id)?.payload as { organizationId: string }).organizationId;
    const deps = { ...fetchDeps(), sources: refusing, fetcher: createMigrationFetcher({ registry: refusing, files: t.files }) };
    expect(await fetchMigration(deps, { organizationId, batchId: id })).toBe('failed');
    expect(await sealedOf(id)).toBeNull();
    expect((await w.owner.get<Record<string, unknown>>(`/api/v1/migrations/${id}`)).body.data).toMatchObject({ status: 'failed', error: 'credentials_refused' });
  });

  it('documents the credentials as write-only, session only', async () => {
    const doc = (await t.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json() as { paths: Record<string, Record<string, { tags: string[]; requestBody?: unknown }>> };
    const post = doc.paths['/api/v1/migrations/connector']?.post;
    expect(post?.tags).toEqual(['Migration']);
    const body = post?.requestBody as { content: Record<string, { schema: { properties: Record<string, { writeOnly?: boolean }> } }> };
    expect(body.content['application/json']?.schema.properties.credentials?.writeOnly).toBe(true);
    expect(doc.paths['/api/v1/migrations/connectors']?.get?.tags).toEqual(['Migration']);
  });
});
