import { describe, expect, it } from 'vitest';
import { pdfBytes, utf8 } from '../testing/fixtures/import-fixtures.js';
import type { ImportEntry } from './archive.js';
import { findNotionExport, normaliseTitle, parseNotionExport } from './notion.js';

const csv = 'Name,Tags,Created time\nMario Rossi,dev,"March 1, 2026"\nAnna Bianchi,ux,"March 2, 2026"\nSenza File,,\n';
export const notionEntries: readonly ImportEntry[] = [
  { path: 'Export/Candidates abc.csv', bytes: utf8(csv) },
  { path: 'Export/Candidates abc_all.csv', bytes: utf8(csv) },
  { path: 'Export/Candidates/Mario Rossi/cv.pdf', bytes: pdfBytes('m') },
  { path: 'Export/Candidates/Mario Rossi/foto.png', bytes: utf8('png') },
  { path: 'Export/Candidates/anna bianchi 0123456789abcdef0123456789abcdef/cv.pdf', bytes: pdfBytes('a') },
  { path: 'Export/Candidates/Mario Rossi.md', bytes: utf8('# page') },
  { path: 'Export/Other/stray.pdf', bytes: pdfBytes('s') },
];

describe('parseNotionExport', () => {
  it('returns rows and attachments by row, preferring the non _all csv', () => {
    const result = parseNotionExport(notionEntries);
    expect(result.tablePath).toBe('Export/Candidates abc.csv');
    expect(result.titleColumn).toBe('Name');
    expect(result.rows).toHaveLength(3);
    expect(result.filesByRow.get(0)).toEqual(['Export/Candidates/Mario Rossi/cv.pdf', 'Export/Candidates/Mario Rossi/foto.png']);
    expect(result.filesByRow.get(1)).toEqual(['Export/Candidates/anna bianchi 0123456789abcdef0123456789abcdef/cv.pdf']);
    expect(result.filesByRow.has(2)).toBe(false);
  });

  it('detects by marker headers alone, and rejects plain tables', () => {
    expect(findNotionExport([{ path: 'a.csv', bytes: utf8('Name,Created time\nX,y\n') }])).not.toBeNull();
    expect(findNotionExport([{ path: 'a.csv', bytes: utf8('Name,Email\nX,y\n') }])).toBeNull();
    expect(findNotionExport([{ path: 'a.csv', bytes: utf8('Email,Phone\nX,y\n') }])).toBeNull();
    expect(findNotionExport([{ path: 'a.csv', bytes: utf8('a,b\n"broken\n') }])).toBeNull();
    expect(() => parseNotionExport([])).toThrow(/Notion/);
  });

  it('detects by attachment folders when there are no marker headers', () => {
    const entries = [{ path: 'db.csv', bytes: utf8('Nome,Email\nGiulia Verdi,g@x.it\n') }, { path: 'db/Giulia Verdi/cv.pdf', bytes: pdfBytes() }];
    expect(parseNotionExport(entries).filesByRow.get(0)).toEqual(['db/Giulia Verdi/cv.pdf']);
  });

  it('normalises titles', () => {
    expect(normaliseTitle('  Città  Verdi 0123456789abcdef0123456789abcdef')).toBe('città verdi');
  });
});
