import ExcelJS from 'exceljs';
import { isWithinOoxmlBudget } from '../zip/bounded-inflate.js';
import { openImportArchive } from './archive.js';
import { IMPORT_MAX_ROWS, ImportError } from './limits.js';
import { isBlankRow, toRow, uniqueHeaders, type ParsedTable } from './table.js';

export interface ParsedWorkbook extends ParsedTable {
  readonly sheetNames: readonly string[];
  /** Name of the sheet the rows come from, null when the workbook has no usable sheet. */
  readonly sheetName: string | null;
}

const MIN_HEADER_CELLS = 2;

function dateToIso(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.replace('.000Z', 'Z');
}

/** Cell value as text. Formulas yield their cached result, never evaluated. */
export function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : dateToIso(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('error' in value) return '';
  if ('formula' in value || 'sharedFormula' in value) return cellToString((value.result ?? null) as ExcelJS.CellValue);
  if ('text' in value) return typeof value.text === 'string' ? value.text : cellToString(value.text as ExcelJS.CellValue);
  return '';
}

function sheetRows(sheet: ExcelJS.Worksheet): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let filled = 0;
  const width = Math.max(sheet.columnCount, 0);
  for (let index = 1; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const cells = Array.from({ length: width }, (_, column) => cellToString(row.getCell(column + 1).value).trim());
    rows.push(cells);
    if (!isBlankRow(cells)) filled += 1;
    if (filled > IMPORT_MAX_ROWS + 1) break;
  }
  return rows;
}

function toTable(rows: readonly (readonly string[])[]): ParsedTable | null {
  const headerIndex = rows.findIndex((cells) => cells.filter((cell) => cell !== '').length >= MIN_HEADER_CELLS);
  const headerRow = rows[headerIndex];
  if (!headerRow) return null;
  const headers = uniqueHeaders(headerRow);
  const data = rows.slice(headerIndex + 1).filter((cells) => !isBlankRow(cells));
  return {
    headers,
    rows: data.slice(0, IMPORT_MAX_ROWS).map((cells) => toRow(headers, cells)),
    truncated: data.length > IMPORT_MAX_ROWS,
  };
}

/**
 * First non-empty sheet; the header is the first row with at least two non-empty cells. Macros and formulas are never
 * run: the package is only used as a reader and the archive is validated (size, ratio) before it is opened.
 */
export async function parseXlsx(bytes: Uint8Array): Promise<ParsedWorkbook> {
  openImportArchive(bytes);
  if (!isWithinOoxmlBudget(bytes)) throw new ImportError('too_large', 'The XLSX inflates to more than allowed.');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch (error) {
    throw new ImportError('invalid_table', `The XLSX could not be read: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  for (const sheet of workbook.worksheets) {
    const table = toTable(sheetRows(sheet));
    if (table) return { ...table, sheetNames, sheetName: sheet.name };
  }
  return { headers: [], rows: [], truncated: false, sheetNames, sheetName: null };
}
