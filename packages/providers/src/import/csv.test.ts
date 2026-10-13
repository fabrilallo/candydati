import { describe, expect, it } from 'vitest';
import { latin1, utf8 } from '../testing/fixtures/import-fixtures.js';
import { decodeText, detectDelimiter, parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses comma CSV with quoted fields, commas and newlines inside quotes', () => {
    const table = parseCsv(utf8('Name,Email,Notes\n"Rossi, Mario",m@x.it,"line1\nline2"\n'));
    expect(table.headers).toEqual(['Name', 'Email', 'Notes']);
    expect(table.rows).toEqual([{ Name: 'Rossi, Mario', Email: 'm@x.it', Notes: 'line1\nline2' }]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv(utf8('a;b\n1;2\n')).rows).toEqual([{ a: '1', b: '2' }]);
    expect(parseCsv(utf8('a\tb\n1\t2\n')).rows).toEqual([{ a: '1', b: '2' }]);
    expect(detectDelimiter('"a;b",c\n')).toBe(',');
    expect(detectDelimiter('')).toBe(',');
  });

  it('strips the UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Nome,Email\nZoë,z@x.it\n')]);
    const table = parseCsv(bytes);
    expect(table.headers[0]).toBe('Nome');
    expect(table.rows[0]?.['Nome']).toBe('Zoë');
  });

  it('falls back to windows-1252', () => {
    const table = parseCsv(latin1('Nome;Città\nNiccolò;Perù\n'));
    expect(table.headers).toEqual(['Nome', 'Città']);
    expect(table.rows[0]).toEqual({ Nome: 'Niccolò', 'Città': 'Perù' });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xe8]))).toContain('è');
  });

  it('makes headers unique, tolerates ragged rows and skips blank ones', () => {
    const table = parseCsv(utf8('a,,a\n1,2,3,4\n,,\n5\n'));
    expect(table.headers).toEqual(['a', 'column_2', 'a (2)']);
    expect(table.rows).toEqual([
      { a: '1', column_2: '2', 'a (2)': '3' },
      { a: '5', column_2: '', 'a (2)': '' },
    ]);
  });

  it('caps rows at 5000 and flags truncation', () => {
    const body = Array.from({ length: 5100 }, (_, i) => `n${i},x`).join('\n');
    const table = parseCsv(utf8(`a,b\n${body}`));
    expect(table.rows).toHaveLength(5000);
    expect(table.truncated).toBe(true);
  });

  it('returns empty for empty input and throws on malformed quotes at EOF', () => {
    expect(parseCsv(utf8('')).headers).toEqual([]);
    expect(() => parseCsv(utf8('a,b\n"unterminated,1\n'))).toThrow(/could not be parsed/);
  });
});
