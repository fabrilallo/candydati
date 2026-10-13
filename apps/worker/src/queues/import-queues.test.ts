import { createImportBatch } from '@tt/core';
import { buildJob, ORG_A, seedImportWorld, userActor } from '@tt/core/testing';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createImportAnalyzeQueue, importPayload } from './import-analyze.js';
import { createImportCommitQueue } from './import-commit.js';

const logger = pino({ level: 'silent' });
const recruiter = userActor({ id: 'user_rec', organizationId: ORG_A, role: 'recruiter' });
const world = () => seedImportWorld({ jobs: [buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') })] });
const csv = (text: string) => new TextEncoder().encode(text);

async function upload(deps: ReturnType<typeof world>, bytes: Uint8Array) {
  return createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', files: [{ fileName: 'people.csv', bytes }] });
}

describe('import queues', () => {
  it('validates the payload: ids only', () => {
    expect(importPayload.safeParse({ organizationId: 'o', batchId: 'b' }).success).toBe(true);
    expect(importPayload.safeParse({ organizationId: 'o' }).success).toBe(false);
  });

  it('import.analyze leaves the batch ready, and fails it with a reason when nothing is usable', async () => {
    const deps = world();
    const queue = createImportAnalyzeQueue({ deps, extractor: null });
    const good = await upload(deps, csv('Nome;Cognome;Email\nAnna;Verdi;anna@posta.it\n'));
    await queue.handle({ jobId: 'j1', payload: { organizationId: ORG_A, batchId: good.id }, logger, lastAttempt: false, attempt: 1 });
    expect(await deps.imports.findById(ORG_A, good.id)).toMatchObject({ status: 'ready', counts: { rows: 1 } });
    const empty = await upload(deps, csv('just text'));
    await queue.handle({ jobId: 'j2', payload: { organizationId: ORG_A, batchId: empty.id }, logger, lastAttempt: false, attempt: 1 });
    expect(await deps.imports.findById(ORG_A, empty.id)).toMatchObject({ status: 'failed', error: 'nothing_to_import' });
  });

  it('import.commit ignores a batch that is not importing, and fails an importing one on the last attempt', async () => {
    const deps = world();
    const queue = createImportCommitQueue(deps);
    const batch = await upload(deps, csv('Nome;Email\nA;a@posta.it\n'));
    const payload = { organizationId: ORG_A, batchId: batch.id };
    await expect(queue.handle({ jobId: 'j', payload, logger, lastAttempt: true, attempt: 4 })).resolves.toBeUndefined();
    const importing = await deps.imports.save({ ...batch, status: 'importing' });
    const broken = createImportCommitQueue({ ...deps, importAnalyses: { ...deps.importAnalyses, find: async () => Promise.reject(new Error('db down')) } });
    await expect(broken.handle({ jobId: 'j', payload, logger, lastAttempt: false, attempt: 1 })).rejects.toThrow('db down');
    expect((await deps.imports.findById(ORG_A, importing.id))?.status).toBe('importing');
    await expect(broken.handle({ jobId: 'j', payload, logger, lastAttempt: true, attempt: 4 })).rejects.toThrow('db down');
    expect(await deps.imports.findById(ORG_A, importing.id)).toMatchObject({ status: 'failed', error: 'commit_failed' });
  });
});
