import {
  buildApplication,
  buildExtraction,
  createInMemoryFileStorage,
  createTestCandidateDeps,
  fakeModelExtractor,
  fakeTextExtractor,
} from '@candydati/core/testing';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createCvExtractQueue, cvExtractPayload } from './cv-extract.js';
import { startWorker, type WorkerBoss } from '../worker.js';

const KEY = 'organizations/org_test/applications/app_1/cv';
const payload = { organizationId: 'org_test', applicationId: 'app_1' };
const logger = pino({ level: 'silent' });

async function world(overrides: Parameters<typeof createTestCandidateDeps>[0] = {}) {
  const deps = createTestCandidateDeps({ files: createInMemoryFileStorage({ [KEY]: new Uint8Array([1]) }), ...overrides });
  await deps.applications.create(buildApplication({ id: 'app_1', organizationId: 'org_test', cv: { key: KEY, fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 1 } }));
  await deps.extractions.upsert(buildExtraction({ applicationId: 'app_1', organizationId: 'org_test', status: 'pending', text: null, data: null, source: null }));
  return deps;
}

const run = (deps: Awaited<ReturnType<typeof world>>, data: unknown = payload) =>
  createCvExtractQueue(deps).handle({ jobId: 'job-1', payload: cvExtractPayload.parse(data), logger, lastAttempt: true, attempt: 1 });

describe('cv.extract queue', () => {
  it('validates the payload: ids only, both required', () => {
    expect(cvExtractPayload.safeParse(payload).success).toBe(true);
    expect(cvExtractPayload.safeParse({ organizationId: 'org' }).success).toBe(false);
  });

  it('extracts text and structured data as a system actor', async () => {
    const deps = await world({ textExtractor: fakeTextExtractor('Sviluppatrice backend'), modelExtractor: fakeModelExtractor({ headline: 'Backend developer' }) });
    await run(deps);
    expect(await deps.extractions.findByApplication('org_test', 'app_1')).toMatchObject({ status: 'done', source: 'model', text: 'Sviluppatrice backend' });
  });

  it('stores the plain text when no model is configured', async () => {
    const deps = await world();
    await run(deps);
    expect(await deps.extractions.findByApplication('org_test', 'app_1')).toMatchObject({ status: 'text_only' });
  });

  it('marks an unreadable document failed without throwing, so it is not retried', async () => {
    const deps = await world({ textExtractor: fakeTextExtractor(new Error('corrupt')) });
    await expect(run(deps)).resolves.toBeUndefined();
    expect(await deps.extractions.findByApplication('org_test', 'app_1')).toMatchObject({ status: 'failed' });
  });

  it('skips an application of another organization', async () => {
    const deps = await world();
    await run(deps, { organizationId: 'org_other', applicationId: 'app_1' });
    expect(await deps.extractions.findByApplication('org_test', 'app_1')).toMatchObject({ status: 'pending' });
  });

  it('fails the job when the infrastructure fails, so pg-boss retries it', async () => {
    const deps = await world({ extractions: { ...(await world()).extractions, findByApplication: async () => { throw new Error('db down'); } } });
    await expect(run(deps)).rejects.toThrow('db down');
  });

  it('is served by the worker under the name cv.extract', async () => {
    const handlers = new Map<string, Parameters<WorkerBoss['work']>[2]>();
    const boss: WorkerBoss = { createQueue: vi.fn(async () => undefined), work: vi.fn(async (name, _options, handler) => (handlers.set(name, handler), name)), schedule: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) };
    const deps = await world();
    await startWorker({ boss, logger, queues: [createCvExtractQueue(deps)] });
    await handlers.get('cv.extract')!([{ id: 'j1', name: 'cv.extract', data: payload }]);
    expect(await deps.extractions.findByApplication('org_test', 'app_1')).toMatchObject({ status: 'text_only' });
    // An invalid payload is logged and completed: retrying it could never succeed.
    await expect(handlers.get('cv.extract')!([{ id: 'j2', name: 'cv.extract', data: { organizationId: 'x' } }])).resolves.toBeUndefined();
  });
});
