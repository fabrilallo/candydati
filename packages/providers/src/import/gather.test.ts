import { describe, expect, it } from 'vitest';
import { makeLyingBomb } from '../testing/fixtures.js';
import { pdfBytes, utf8, zipOf } from '../testing/fixtures/import-fixtures.js';
import { openImportArchive } from './archive.js';
import { gatherSources, type FoundCv } from './gather.js';
import { createCvParser } from './parse-cvs.js';
import { DEFAULT_IMPORT_LIMITS, ImportError } from './limits.js';

const source = (fileName: string, bytes: Uint8Array) => ({ key: `k/${fileName}`, fileName, bytes });
const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ImportError ? error.code : 'other';
  }
  return undefined;
};

describe('gatherSources', () => {
  it('hands each CV to the handler as it is found and keeps none of them', async () => {
    const seen: string[] = [];
    const archive = zipOf({ 'a.pdf': pdfBytes('Ada'), 'b.pdf': pdfBytes('Bob'), 'people.csv': utf8('Name,Email\nAda,ada@x.it\n') });
    const gathered = await gatherSources([source('x.zip', archive)], async (cv: FoundCv) => void seen.push(cv.fileName));
    expect(seen).toEqual(['a.pdf', 'b.pdf']);
    expect(gathered).toMatchObject({ cvCount: 2, headers: ['Name', 'Email'] });
    expect(gathered.rows).toHaveLength(1);
    expect('cvs' in gathered).toBe(false);
  });

  it('pulls sources one at a time', async () => {
    const order: string[] = [];
    async function* lazy() {
      for (const name of ['one.zip', 'two.zip']) {
        order.push(`load ${name}`);
        yield source(name, zipOf({ [`${name}.pdf`]: pdfBytes(name) }));
      }
    }
    await gatherSources(lazy(), async (cv) => void order.push(`cv ${cv.fileName}`));
    expect(order).toEqual(['load one.zip', 'cv one.zip.pdf', 'load two.zip', 'cv two.zip.pdf']);
  });

  it('shares the entry and size limits across every file of the batch', async () => {
    const limits = { ...DEFAULT_IMPORT_LIMITS, maxEntries: 3 };
    const two = () => source('x.zip', zipOf({ 'a.pdf': pdfBytes('a'), 'b.pdf': pdfBytes('b') }));
    expect(await codeOf(gatherSources([two()], async () => undefined, limits))).toBeUndefined();
    expect(await codeOf(gatherSources([two(), two()], async () => undefined, limits))).toBe('too_many_entries');
    const bytes = { ...DEFAULT_IMPORT_LIMITS, maxTotalBytes: 3000 };
    const big = () => source('y.zip', zipOf({ 'a.csv': utf8(`Name\n${'x'.repeat(1500)}\n`) }));
    expect(await codeOf(gatherSources([big()], async () => undefined, bytes))).toBeUndefined();
    expect(await codeOf(gatherSources([big(), big(), big()], async () => undefined, bytes))).toBe('too_large');
  });
});

describe('openImportArchive with a lying entry', () => {
  it('stops inflating an entry that grows past its declared size', () => {
    const archive = openImportArchive(makeLyingBomb('cv.pdf', 64 * 1024 * 1024, 100));
    expect(() => archive.inflate('cv.pdf')).toThrow(expect.objectContaining({ code: 'too_large' }));
  });
});

describe('openImportArchive', () => {
  it('lists entries without inflating and inflates one at a time', () => {
    const archive = openImportArchive(zipOf({ 'a.pdf': pdfBytes('a'), 'dir/b.txt': utf8('hello') }));
    expect(archive.entries.map((entry) => entry.path)).toEqual(['a.pdf', 'dir/b.txt']);
    expect(archive.entryCount).toBe(2);
    const text = archive.entries.find((entry) => entry.path === 'dir/b.txt')!;
    expect(new TextDecoder().decode(archive.inflate(text.name))).toBe('hello');
  });
});

describe('createCvParser', () => {
  it('never has more CVs in flight than its concurrency, however many are submitted', async () => {
    let active = 0;
    let peak = 0;
    const parser = createCvParser(
      async (_cv, index) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return `key-${index}`;
      },
      { concurrency: 2 },
    );
    const cv: FoundCv = { fileName: 'a.pdf', mediaType: 'application/pdf', bytes: pdfBytes('Ada Lovelace ada@example.org'), sourceKey: null };
    for (let i = 0; i < 20; i += 1) await parser.submit(cv);
    const results = await parser.finish();
    expect(results.map((r) => r.key)).toEqual(Array.from({ length: 20 }, (_, i) => `key-${i}`));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('surfaces the first failure and stops accepting CVs', async () => {
    const parser = createCvParser(async (_cv, index) => {
      if (index === 1) throw new Error('storage down');
      return `key-${index}`;
    });
    const cv: FoundCv = { fileName: 'a.pdf', mediaType: 'application/pdf', bytes: pdfBytes('x'), sourceKey: null };
    await parser.submit(cv);
    await parser.submit(cv);
    await expect(parser.finish()).rejects.toThrow('storage down');
    await expect(parser.submit(cv)).rejects.toThrow('storage down');
  });
});
