import { describe, expect, it } from 'vitest';
import { utf8, xlsxBytes, zipOf } from '../testing/fixtures/import-fixtures.js';
import { cellToString, parseXlsx } from './xlsx.js';

describe('parseXlsx', () => {
  it('reads the first non-empty sheet, detects the header row and flattens values', async () => {
    const bytes = await xlsxBytes((wb) => {
      wb.addWorksheet('Empty');
      const sheet = wb.addWorksheet('Candidati');
      sheet.getCell('A1').value = 'Elenco candidati 2026';
      sheet.addRow(['Nome', 'Email', 'Data', 'Anni', 'Note', 'Formula']);
      sheet.addRow([
        'Mario Rossi',
        { text: 'm@x.it', hyperlink: 'mailto:m@x.it' },
        new Date(Date.UTC(2026, 2, 1)),
        7.5,
        { richText: [{ text: 'ottimo ' }, { text: 'profilo' }] },
        { formula: 'A3&"!"', result: 'Mario Rossi!' },
      ]);
      sheet.addRow([]);
      sheet.addRow(['Anna Bianchi', 'a@x.it', new Date(Date.UTC(2026, 2, 1, 10, 30)), true]);
      wb.addWorksheet('Altro');
    });
    const table = await parseXlsx(bytes);
    expect(table.sheetNames).toEqual(['Empty', 'Candidati', 'Altro']);
    expect(table.sheetName).toBe('Candidati');
    expect(table.headers).toEqual(['Nome', 'Email', 'Data', 'Anni', 'Note', 'Formula']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual({ Nome: 'Mario Rossi', Email: 'm@x.it', Data: '2026-03-01', Anni: '7.5', Note: 'ottimo profilo', Formula: 'Mario Rossi!' });
    expect(table.rows[1]).toMatchObject({ Nome: 'Anna Bianchi', Data: '2026-03-01T10:30:00Z', Anni: 'true' });
  });

  it('returns an empty table when no sheet has a header', async () => {
    const bytes = await xlsxBytes((wb) => {
      wb.addWorksheet('One').getCell('A1').value = 'only one cell';
    });
    expect(await parseXlsx(bytes)).toMatchObject({ headers: [], rows: [], sheetName: null, sheetNames: ['One'] });
  });

  it('caps rows at 5000', async () => {
    const bytes = await xlsxBytes((wb) => {
      const sheet = wb.addWorksheet('S');
      sheet.addRow(['a', 'b']);
      for (let i = 0; i < 5050; i += 1) sheet.addRow([`n${i}`, 'x']);
    });
    const table = await parseXlsx(bytes);
    expect(table.rows).toHaveLength(5000);
    expect(table.truncated).toBe(true);
  });

  it('rejects broken files and bombs', async () => {
    await expect(parseXlsx(utf8('nope'))).rejects.toMatchObject({ code: 'invalid_archive' });
    await expect(parseXlsx(zipOf({ 'xl/big.xml': new Uint8Array(5 * 1024 * 1024) }))).rejects.toMatchObject({ code: 'ratio_exceeded' });
  });
});

describe('cellToString', () => {
  it('handles every value shape', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString(new Date(Number.NaN))).toBe('');
    expect(cellToString({ error: '#N/A' })).toBe('');
    expect(cellToString({ formula: 'A1' })).toBe('');
    expect(cellToString({ sharedFormula: 'B1', result: 3 })).toBe('3');
    expect(cellToString({ text: { richText: [{ text: 'x' }] }, hyperlink: 'h' } as never)).toBe('x');
    expect(cellToString({} as never)).toBe('');
  });
});
