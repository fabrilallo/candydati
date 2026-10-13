import { createImportBatch } from '@tt/core';
import { buildJob, ORG_A, seedImportWorld, userActor } from '@tt/core/testing';
import { describe, expect, it } from 'vitest';
import { makePdf, makeZip } from '../testing/fixtures.js';
import { utf8, xlsxBytes, zipOf } from '../testing/fixtures/import-fixtures.js';
import { notionEntries } from './notion.test.js';
import { runImportAnalysis } from './run-analysis.js';
import { parseCvs } from './parse-cvs.js';

const recruiter = userActor({ id: 'user_rec', organizationId: ORG_A, role: 'recruiter' });
const world = () => seedImportWorld({ jobs: [buildJob({ id: 'job_1', slug: 'backend', organizationId: ORG_A, status: 'published', publishedAt: new Date('2026-02-01T00:00:00Z') })] });
type World = ReturnType<typeof world>;

async function upload(deps: World, files: readonly { fileName: string; bytes: Uint8Array }[]) {
  return createImportBatch(deps, recruiter, { jobId: 'job_1', stageId: 'received', files: [...files] });
}
const run = (deps: World, batchId: string, options = {}) => runImportAnalysis(deps, { organizationId: ORG_A, batchId }, options);

const cv = (name: string, email: string) => makePdf([name, 'Data Analyst', `Email: ${email}`, 'Tel: 333 123 4567']);

describe('runImportAnalysis', () => {
  it('turns a ZIP of CVs plus a sheet into a ready batch with matched items', async () => {
    const deps = world();
    const sheet = await xlsxBytes((wb) => {
      const ws = wb.addWorksheet('S');
      ws.addRow(['Nome', 'Cognome', 'Email', 'Note']);
      ws.addRow(['Anna', 'Verdi', 'anna@posta.it', 'ottima']);
      ws.addRow(['Luca', 'Senza Cv', 'luca@example.com', '']);
    });
    const archive = zipOf({ 'cvs/anna.pdf': cv('Anna Verdi', 'anna@posta.it'), 'cvs/sub/bruno.pdf': cv('Bruno Neri', 'bruno@posta.it'), 'cvs/readme.txt': utf8('hi') });
    const batch = await upload(deps, [{ fileName: 'cvs.zip', bytes: archive }, { fileName: 'people.xlsx', bytes: sheet }]);
    expect(await run(deps, batch.id)).toBe('ready');
    const stored = await deps.imports.findById(ORG_A, batch.id);
    expect(stored).toMatchObject({ status: 'ready', counts: { cvs: 2, rows: 2, items: 3 } });
    const items = await deps.importItems.listAll(ORG_A, batch.id);
    const anna = items.find((item) => item.proposal.candidate.email === 'anna@posta.it');
    expect(anna?.proposal).toMatchObject({ confidence: 'high', basis: 'email' });
    expect(anna?.proposal.cv?.key).toContain('/imports/');
    expect(deps.files.keys().filter((key) => key.includes('/cv/'))).toHaveLength(2);
    expect(await run(deps, batch.id)).toBe('skipped');
  });

  it('links Notion rows to their attached CVs', async () => {
    const deps = world();
    const batch = await upload(deps, [{ fileName: 'notion.zip', bytes: zipOf(Object.fromEntries(notionEntries.map((entry) => [entry.path, entry.bytes]))) }]);
    expect(await run(deps, batch.id)).toBe('ready');
    const stored = await deps.imports.findById(ORG_A, batch.id);
    expect(stored?.mapping?.file).toBe('Attached files');
    expect((stored?.counts.cvs ?? 0) > 0).toBe(true);
  });

  it.each([
    ['an unsafe archive', makeZip([{ name: '../evil.pdf', content: 'x' }]), 'unsafe_path'],
    ['a zip bomb', makeZip([{ name: 'a.csv', content: 'x', declaredSize: 400 * 1024 * 1024 }]), 'ratio_exceeded'],
    ['a file with nothing usable', utf8('plain text, no table'), 'nothing_to_import'],
  ])('fails the batch with a safe reason for %s', async (_label, bytes, reason) => {
    const deps = world();
    const name = reason === 'nothing_to_import' ? 'notes.txt' : 'x.zip';
    const batch = await upload(deps, [{ fileName: name, bytes }]);
    expect(await run(deps, batch.id)).toBe('failed');
    expect(await deps.imports.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: reason });
    expect(deps.files.keys()).toEqual([]);
  });

  it('retries unexpected errors and fails the batch only on the last attempt', async () => {
    const deps = world();
    const batch = await upload(deps, [{ fileName: 'people.csv', bytes: utf8('Nome;Email\nA;a@example.com\n') }]);
    const broken = { ...deps, files: { ...deps.files, get: async () => Promise.reject(new Error('storage down')) } };
    await expect(run(broken as World, batch.id)).rejects.toThrow('storage down');
    expect(await run(broken as World, batch.id, { lastAttempt: true })).toBe('failed');
    expect(await deps.imports.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: 'analysis_failed' });
  });
});

describe('parseCvs', () => {
  const found = (name: string) => ({ fileName: `${name}.pdf`, mediaType: 'application/pdf' as const, bytes: cv(name, 'x@example.com'), sourceKey: null });

  it('bounds the concurrency and stops asking the model once the budget is spent', async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    const extractor = {
      extract: async () => {
        calls += 1;
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { data: null, source: 'model' as const };
      },
    };
    const cvs = Array.from({ length: 8 }, (_, i) => found(`Persona Numero${i}`));
    await parseCvs(cvs, cvs.map((_, i) => `k${i}`), { extractor, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(calls).toBe(8);
    calls = 0;
    const parsed = await parseCvs(cvs, cvs.map((_, i) => `k${i}`), { extractor, budgetMs: -1 });
    expect(calls).toBe(0);
    expect(parsed).toHaveLength(8);
    expect(parsed[0]?.extraction).toBeNull();
  });

  it('keeps the text when a document cannot be read', async () => {
    const parsed = await parseCvs([{ fileName: 'bad.pdf', mediaType: 'application/pdf', bytes: utf8('%PDF-1.4 broken'), sourceKey: null }], ['k']);
    expect(parsed[0]).toMatchObject({ fileName: 'bad.pdf', key: 'k', text: '' });
  });
});
