import { describe, expect, it } from 'vitest';
import { importBatchPageSchema, importBatchRefSchema, importBatchSchema, importItemSchema, undoImportSchema } from './import.js';

const counts = { files: 3, cvs: 2, rows: 1, items: 3, included: 3, imported: 0, merged: 0, failed: 0, noEmail: 0, emailsQueued: 0, skippedReconfirmed: 0, erased: 0 };
const batch = {
  id: 'b1',
  jobId: 'j1',
  stageId: 'received',
  status: 'ready',
  counts,
  mapping: null,
  headers: ['Nome'],
  error: null,
  createdAt: '2026-10-10T09:00:00.000Z',
  importedAt: null,
  undoneAt: null,
  job: { id: 'j1', title: 'Data Engineer' },
  createdBy: { id: 'u1', name: 'Elena' },
};
const item = {
  id: 'i1',
  position: 0,
  included: true,
  status: 'pending',
  error: null,
  confidence: 'high',
  basis: 'email',
  candidate: { firstName: 'Anna', lastName: 'Rossi', email: 'a@x.it', phone: null, linkedinUrl: null, tags: [], note: null },
  cv: { fileName: 'a.pdf', key: 'k' },
  headline: null,
  sources: { rows: [0], files: ['a.pdf'] },
  existing: null,
  conflicts: [],
  flags: ['no_cv'],
};

describe('import wire schemas', () => {
  it('reads the batch as the api sends it, with or without column samples', () => {
    expect(importBatchSchema.parse(batch).columnSamples).toBeUndefined();
    expect(importBatchSchema.parse({ ...batch, columnSamples: { Nome: ['a', 'b', 'c'] } }).columnSamples).toEqual({ Nome: ['a', 'b', 'c'] });
    expect(() => importBatchSchema.parse({ ...batch, columnSamples: { Nome: ['a', 'b', 'c', 'd'] } })).toThrow();
  });

  it('is strict: a missing author or an unknown status is refused', () => {
    expect(() => importBatchSchema.parse({ ...batch, createdBy: undefined })).toThrow();
    expect(() => importBatchSchema.parse({ ...batch, status: 'weird' })).toThrow();
    expect(importBatchSchema.parse({ ...batch, job: null }).job).toBeNull();
  });

  it('reads items with nested candidate and sources, the page and the undo result', () => {
    expect(importItemSchema.parse(item).sources).toEqual({ rows: [0], files: ['a.pdf'] });
    expect(() => importItemSchema.parse({ ...item, flags: ['made_up'] })).toThrow();
    const page = importBatchPageSchema.parse({ batch, items: [item], total: 1, page: 1, limit: 200 });
    expect(page.items).toHaveLength(1);
    expect(undoImportSchema.parse({ batch, erased: 8, skippedReconfirmed: 2, failed: 0 }).erased).toBe(8);
    expect(importBatchRefSchema.parse({ id: 'b1', status: 'uploaded' }).status).toBe('uploaded');
  });
});
