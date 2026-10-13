import { parse } from 'csv-parse/sync';
import { IMPORT_MAX_ROWS, ImportError } from './limits.js';
import { isBlankRow, toRow, uniqueHeaders, type ParsedTable } from './table.js';

const DELIMITERS = [',', ';', '\t'] as const;
const UTF8_BOM = [0xef, 0xbb, 0xbf];

/** UTF-8 (with or without BOM) when valid, windows-1252 otherwise. */
export function decodeText(bytes: Uint8Array): string {
  const hasBom = UTF8_BOM.every((value, index) => bytes[index] === value);
  const content = hasBom ? bytes.subarray(UTF8_BOM.length) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return new TextDecoder('windows-1252').decode(content);
  }
}

/** Counts each candidate delimiter in the first non-empty line, outside quotes. */
export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((candidate) => candidate.trim() !== '') ?? '';
  const counts = new Map<string, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return DELIMITERS.reduce((best, delimiter) => ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0) ? delimiter : best), ',');
}

/** Parses a CSV; the first non-empty record is the header. At most 5000 data rows. */
export function parseCsv(bytes: Uint8Array): ParsedTable {
  const text = decodeText(bytes);
  let records: string[][];
  try {
    records = parse(text, {
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      to: IMPORT_MAX_ROWS + 2 + 1,
    }) as string[][];
  } catch (error) {
    throw new ImportError('invalid_table', `The CSV could not be parsed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  const body = records.filter((record) => !isBlankRow(record));
  const [first, ...data] = body;
  if (!first) return { headers: [], rows: [], truncated: false };
  const headers = uniqueHeaders(first);
  return {
    headers,
    rows: data.slice(0, IMPORT_MAX_ROWS).map((cells) => toRow(headers, cells)),
    truncated: data.length > IMPORT_MAX_ROWS,
  };
}
