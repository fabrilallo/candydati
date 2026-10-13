import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxBytes, pdfBytes, symlinkZip, zipOf } from '../testing/fixtures/import-fixtures.js';
import { readImportArchive } from './archive.js';
import { DEFAULT_IMPORT_LIMITS, ImportError } from './limits.js';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof ImportError ? error.code : 'other';
  }
  return undefined;
};

describe('readImportArchive', () => {
  it('returns files and skips directories, __MACOSX and dotfiles', () => {
    const bytes = zipSync({
      'cvs/a.pdf': pdfBytes('a'),
      'cvs/': new Uint8Array(0),
      '__MACOSX/cvs/._a.pdf': strToU8('x'),
      'cvs/.DS_Store': strToU8('x'),
      '.hidden/b.pdf': pdfBytes('b'),
      'dir\\b.pdf': pdfBytes('c'),
    } as Zippable);
    const entries = readImportArchive(bytes);
    expect(entries.map((entry) => entry.path).sort()).toEqual(['cvs/a.pdf', 'dir/b.pdf']);
  });

  it('does not expand nested archives', () => {
    const entries = readImportArchive(zipOf({ 'inner.zip': docxBytes() }));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe('inner.zip');
  });

  it.each(['/etc/passwd', '../evil.pdf', 'a/../../evil.pdf', 'C:/evil.pdf', '__MACOSX/../x.pdf', 'a\\..\\b'])('rejects unsafe path %s', (name) => {
    expect(codeOf(() => readImportArchive(zipOf({ [name]: strToU8('x') })))).toBe('unsafe_path');
  });

  it('rejects symlinks', () => {
    expect(codeOf(() => readImportArchive(symlinkZip()))).toBe('symlink');
  });

  it('rejects a zip bomb by ratio', () => {
    const bomb = zipOf({ 'zeros.bin': new Uint8Array(5 * 1024 * 1024) });
    expect(bomb.byteLength).toBeLessThan(50_000);
    expect(codeOf(() => readImportArchive(bomb))).toBe('ratio_exceeded');
  });

  it('rejects too much expanded data and too many entries', () => {
    const noise = Uint8Array.from({ length: 4000 }, (_, i) => (i * 7919) % 251);
    const bytes = zipOf({ 'a.bin': noise, 'b.bin': noise });
    expect(codeOf(() => readImportArchive(bytes, { ...DEFAULT_IMPORT_LIMITS, maxTotalBytes: 5000 }))).toBe('too_large');
    expect(codeOf(() => readImportArchive(bytes, { ...DEFAULT_IMPORT_LIMITS, maxEntries: 1 }))).toBe('too_many_entries');
  });

  it('rejects data that is not a zip or has a corrupted directory', () => {
    expect(codeOf(() => readImportArchive(strToU8('hello')))).toBe('invalid_archive');
    const bytes = zipOf({ 'a.txt': strToU8('hello world') });
    const broken = bytes.slice();
    broken[bytes.byteLength - 22 - 46 - 5] = 0; // inside the central directory
    expect(codeOf(() => readImportArchive(broken))).toBe('invalid_archive');
  });
});
