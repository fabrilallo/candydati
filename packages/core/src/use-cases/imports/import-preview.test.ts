import { importFilePrefix } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { buildCandidate, fakePdfBytes, ORG_A } from '../../testing/index.js';
import { recordImportAnalysis, startImportAnalysis, failImportBatch } from './analyze.js';
import { createImportBatch } from './create-import-batch.js';
import { getImportBatch, setImportItems, updateImportMapping } from './queries.js';
import { requestImportCommit } from './request-commit.js';
import { GIULIA, GIULIA_ROW, importWorld, JOB_2, MARIO, MARIO_ROW, readyBatch, recruiter, row } from './fixtures.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('createImportBatch', () => {
  it('stores the originals under the batch prefix, audits and queues the analysis', async () => {
    const deps = importWorld();
    const batch = await createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', files: [{ fileName: '../evil/cv.zip', bytes: fakePdfBytes() }] });
    expect(batch).toMatchObject({ status: 'uploaded', jobId: 'job_1', stageId: 'received', createdBy: 'user_rec', counts: { files: 1 } });
    expect(batch.sourceFiles[0]?.key.startsWith(importFilePrefix(ORG_A, batch.id))).toBe(true);
    expect(batch.sourceFiles[0]?.key).not.toContain('..');
    expect(deps.files.keys()).toEqual([batch.sourceFiles[0]?.key]);
    expect(deps.queue.jobs()).toEqual([{ name: 'import.analyze', payload: { organizationId: ORG_A, batchId: batch.id } }]);
    expect(deps.auditLog.events().map((e) => e.action)).toContain('import.created');
  });

  it('refuses unknown job or stage, closed jobs, empty files and oversized batches', async () => {
    const deps = importWorld();
    const base = { jobId: 'job_1', stageId: 'received', files: [{ fileName: 'a.csv', bytes: fakePdfBytes() }] };
    expect(await rejection(createImportBatch(deps, recruiter, { ...base, jobId: 'nope' }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(createImportBatch(deps, recruiter, { ...base, stageId: 'nope' }))).toBeInstanceOf(ValidationError);
    expect(await rejection(createImportBatch(deps, recruiter, { ...base, files: [] }))).toBeInstanceOf(ValidationError);
    expect(await rejection(createImportBatch(deps, recruiter, { ...base, files: [{ fileName: 'a.csv', bytes: new Uint8Array(0) }] }))).toBeInstanceOf(ValidationError);
    const huge = { fileName: 'big.zip', bytes: new Uint8Array(1) };
    Object.defineProperty(huge.bytes, 'byteLength', { value: 201 * 1024 * 1024 });
    expect(await rejection(createImportBatch(deps, recruiter, { ...base, files: [huge] }))).toBeInstanceOf(ValidationError);
    const closed = importWorld({ jobs: [] });
    expect(await rejection(createImportBatch(closed, recruiter, base))).toBeInstanceOf(NotFoundError);
    expect(deps.importStore.read().batches).toHaveLength(0);
  });

  it('marks the batch failed when the analysis cannot be queued, and removes the files when the write fails', async () => {
    const down = importWorld({ importOverrides: { queue: { async enqueue() { throw new Error('down'); } } } });
    const batch = await createImportBatch(down, recruiter, { jobId: 'job_1', stageId: 'received', files: [{ fileName: 'a.csv', bytes: fakePdfBytes() }] });
    expect(batch).toMatchObject({ status: 'failed', error: 'queue_unavailable' });
    const broken = importWorld();
    const failing = { ...broken, imports: { ...broken.imports, create: async () => Promise.reject(new Error('db down')) } };
    expect((await rejection(createImportBatch(failing, recruiter, { jobId: 'job_1', stageId: 'received', files: [{ fileName: 'a.csv', bytes: fakePdfBytes() }] }))) as Error).toHaveProperty('message', 'db down');
    expect(broken.files.keys()).toEqual([]);
  });
});

describe('analysis', () => {
  it('goes uploaded -> analyzing -> ready with the proposed mapping, items and counts', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW, row(4, { Nome: 'Carlo', Cognome: 'Neri' })]);
    expect(batch).toMatchObject({ status: 'ready', mapping: { firstName: 'Nome', email: 'Email', file: 'CV' }, counts: { cvs: 2, rows: 3, items: 3, included: 2, noEmail: 1 } });
    const page = await getImportBatch(deps, recruiter, { batchId: batch.id });
    expect(page.total).toBe(3);
    expect(page.items.map((i) => [i.proposal.confidence, i.proposal.cv?.fileName ?? null])).toEqual([['high', 'Mario_Rossi.pdf'], ['medium', 'Giulia_Bianchi.docx'], ['medium', null]]);
  });

  it('paginates and filters the preview by confidence', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    expect((await getImportBatch(deps, recruiter, { batchId: batch.id, limit: 1 })).items).toHaveLength(1);
    expect((await getImportBatch(deps, recruiter, { batchId: batch.id, page: 2, limit: 1 })).items[0]?.position).toBe(1);
    expect((await getImportBatch(deps, recruiter, { batchId: batch.id, confidence: 'medium' })).total).toBe(1);
  });

  it('refuses CV keys outside the batch prefix and a second analysis of a ready batch', async () => {
    const deps = importWorld();
    const created = await createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', files: [{ fileName: 'a.zip', bytes: fakePdfBytes() }] });
    const evil = { fileName: 'x.pdf', key: 'organizations/org_b/applications/x/cv', text: '', extraction: null };
    expect(await rejection(recordImportAnalysis(deps, { organizationId: ORG_A, batchId: created.id, headers: [], cvs: [evil], rows: [] }))).toBeInstanceOf(ValidationError);
    await recordImportAnalysis(deps, { organizationId: ORG_A, batchId: created.id, headers: [], cvs: [], rows: [] });
    expect(await rejection(startImportAnalysis(deps, { organizationId: ORG_A, batchId: created.id }))).toBeInstanceOf(ConflictError);
  });

  it('records a failure with its reason', async () => {
    const deps = importWorld();
    const created = await createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', files: [{ fileName: 'a.zip', bytes: fakePdfBytes() }] });
    const failed = await failImportBatch(deps, { organizationId: ORG_A, batchId: created.id, reason: 'zip_bomb' });
    expect(failed).toMatchObject({ status: 'failed', error: 'zip_bomb' });
  });

  it('marks people who already exist and does not touch them', async () => {
    const deps = importWorld({ candidates: [buildCandidate({ organizationId: ORG_A, id: 'cand_9', email: 'mario@example.com', firstName: 'Marione', lastName: 'Rossi' })], applications: [] });
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const [item] = (await getImportBatch(deps, recruiter, { batchId: batch.id })).items;
    expect(item?.proposal.existing).toMatchObject({ id: 'cand_9' });
    expect(item?.proposal.conflicts.map((c) => c.field)).toContain('name');
  });
});

describe('preview editing', () => {
  it('re-runs the matching when the mapping changes and refuses unknown columns', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [], [row(2, { Nome: 'Mario', Cognome: 'Rossi', Email: 'a@x.it' })]);
    const swapped = { ...batch.mapping!, email: null };
    const page = await updateImportMapping(deps, recruiter, { batchId: batch.id, mapping: swapped });
    expect(page.items[0]?.proposal.flags).toContain('no_email');
    expect(page.batch.counts.noEmail).toBe(1);
    expect(await rejection(updateImportMapping(deps, recruiter, { batchId: batch.id, mapping: { ...swapped, phone: 'Nope' } }))).toBeInstanceOf(ValidationError);
  });

  it('includes and excludes people, refuses to include one without a CV, and changes the target', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW, GIULIA_ROW]);
    const items = (await getImportBatch(deps, recruiter, { batchId: batch.id })).items;
    const [withCv, withoutCv] = items;
    expect(await rejection(setImportItems(deps, recruiter, { batchId: batch.id, items: [{ itemId: withoutCv!.id, included: true }] }))).toBeInstanceOf(ValidationError);
    const page = await setImportItems(deps, recruiter, { batchId: batch.id, items: [{ itemId: withCv!.id, included: false }], target: { jobId: JOB_2, stageId: 'received' } });
    expect(page.batch).toMatchObject({ jobId: JOB_2, counts: { included: 0 } });
    expect(await rejection(setImportItems(deps, recruiter, { batchId: batch.id, target: { jobId: JOB_2, stageId: 'zzz' } }))).toBeInstanceOf(ValidationError);
    expect(await rejection(setImportItems(deps, recruiter, { batchId: batch.id, target: { jobId: 'nope', stageId: 'received' } }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(requestImportCommit(deps, recruiter, { batchId: batch.id }))).toBeInstanceOf(ValidationError);
  });

  it('cannot edit once the commit was requested', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await requestImportCommit(deps, recruiter, { batchId: batch.id });
    expect(await rejection(setImportItems(deps, recruiter, { batchId: batch.id, items: [] }))).toBeInstanceOf(ConflictError);
    expect(await rejection(requestImportCommit(deps, recruiter, { batchId: batch.id }))).toBeInstanceOf(ConflictError);
    expect(deps.queue.jobs().at(-1)).toEqual({ name: 'import.commit', payload: { organizationId: ORG_A, batchId: batch.id } });
  });

  it('reverts to ready and says so when the commit cannot be queued', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const down = { ...deps, queue: { async enqueue() { throw new Error('down'); } } };
    expect(await rejection(requestImportCommit(down, recruiter, { batchId: batch.id }))).toBeInstanceOf(ConflictError);
    expect((await deps.imports.findById(ORG_A, batch.id))?.status).toBe('ready');
  });
});

