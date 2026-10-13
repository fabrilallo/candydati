import { describe, expect, it } from 'vitest';
import { docxBytes, pdfBytes, utf8, xlsxBytes, zipOf } from '../testing/fixtures/import-fixtures.js';
import { classifyImportFiles } from './classify.js';
import { notionEntries } from './notion.test.js';

describe('classifyImportFiles', () => {
  it('sorts by content, not by name', async () => {
    const xlsx = await xlsxBytes((wb) => wb.addWorksheet('S').addRow(['a', 'b']));
    const result = classifyImportFiles([
      { path: 'cv/fake.pdf', bytes: utf8('not a pdf') },
      { path: 'cv/real.txt', bytes: pdfBytes() },
      { path: 'cv/word.bin', bytes: docxBytes() },
      { path: 'people.csv', bytes: utf8('Nome;Email\nA;a@x.it\n') },
      { path: 'people.dat', bytes: xlsx },
      { path: 'bad.csv', bytes: new Uint8Array([0, 1, 2, 3]) },
      { path: 'onecol.csv', bytes: utf8('Name\nX\n') },
      { path: 'inner.zip', bytes: zipOf({ 'x.txt': utf8('x') }) },
      { path: 'empty.pdf', bytes: new Uint8Array(0) },
    ]);
    expect(result.cvs.map((cv) => [cv.path, cv.mediaType.split('/')[1]?.slice(0, 3)])).toEqual([
      ['cv/real.txt', 'pdf'],
      ['cv/word.bin', 'vnd'],
    ]);
    expect(result.tables.map((t) => [t.path, t.kind])).toEqual([['people.csv', 'csv'], ['people.dat', 'xlsx']]);
    expect(result.ignored).toEqual([
      { path: 'cv/fake.pdf', reason: 'unsupported_type' },
      { path: 'bad.csv', reason: 'not_a_table' },
      { path: 'onecol.csv', reason: 'not_a_table' },
      { path: 'inner.zip', reason: 'nested_archive' },
      { path: 'empty.pdf', reason: 'empty_file' },
    ]);
    expect(result.notionTablePath).toBeNull();
  });

  it('detects a Notion export and keeps its database out of the plain tables', () => {
    const result = classifyImportFiles(notionEntries);
    expect(result.notionTablePath).toBe('Export/Candidates abc.csv');
    expect(result.tables.map((t) => t.path)).toEqual(['Export/Candidates abc_all.csv']);
    expect(result.cvs).toHaveLength(3);
    expect(result.ignored.map((i) => i.path)).toContain('Export/Candidates/Mario Rossi.md');
  });
});
