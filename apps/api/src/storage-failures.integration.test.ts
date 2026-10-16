import type { ImportBatchDto } from '@candydati/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWorld } from './testing/candidate-world.js';
import { cvPdf, uploadImport } from './testing/import-world.js';
import { createTestApp, type TestApp } from './testing/test-app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});
afterEach(() => vi.restoreAllMocks());

const down = () => new Error('connect ECONNREFUSED 10.0.0.9:9000');
const expectUnavailable = (response: { statusCode: number; body: string }) => {
  expect(response.statusCode).toBe(503);
  const body = JSON.parse(response.body) as { success: boolean; error: { code: string; message: string } };
  expect(body.error.code).toBe('storage_unavailable');
  expect(response.body).not.toContain('ECONNREFUSED');
  expect(response.body).not.toContain('10.0.0.9');
};

describe('storage down', () => {
  it('import upload answers 503 storage_unavailable and leaves no batch behind', async () => {
    const w = await createWorld(t);
    vi.spyOn(t.files, 'putStream').mockRejectedValue(down());
    expectUnavailable(await uploadImport(t, w.owner, w.job.id, [{ fileName: 'cv.zip', bytes: cvPdf('Anna Verdi', 'anna@posta.it') }]));
    vi.restoreAllMocks();
    expect((await w.owner.get<ImportBatchDto[]>('/api/v1/imports')).body.data).toEqual([]);
  });

  it('public application answers 503 and stores no application', async () => {
    const w = await createWorld(t);
    vi.spyOn(t.files, 'put').mockRejectedValue(down());
    expectUnavailable(await w.submit());
    vi.restoreAllMocks();
    expect((await w.owner.get<{ applications: unknown[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications).toEqual([]);
  });

  it('CV download answers 503', async () => {
    const w = await createWorld(t);
    expect((await w.submit()).statusCode).toBe(201);
    const [card] = (await w.owner.get<{ applications: { id: string }[] }>(`/api/v1/jobs/${w.job.id}/pipeline`)).body.data!.applications;
    vi.spyOn(t.files, 'get').mockRejectedValue(down());
    expectUnavailable(await w.owner.download(`/api/v1/applications/${card!.id}/cv`));
  });
});
