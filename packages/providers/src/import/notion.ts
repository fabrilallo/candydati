import { parseCsv } from './csv.js';
import type { ImportEntry } from './archive.js';
import { ImportError } from './limits.js';
import type { ParsedTable } from './table.js';

export interface NotionExport extends ParsedTable {
  readonly tablePath: string;
  readonly titleColumn: string;
  /** Row index (in `rows`) to the paths of the files Notion put in the folder named after the page title. */
  readonly filesByRow: ReadonlyMap<number, readonly string[]>;
}

const TITLE_HEADER = /^(name|nome|title|titolo)$/i;
const MARKER_HEADER = /^(created time|last edited time|created by|last edited by|creato il|ultima modifica|data di creazione)$/i;
const NOTION_ID_SUFFIX = / [0-9a-f]{32}$/i;

const isCsvPath = (path: string): boolean => /\.csv$/i.test(path);

/** Page folders may carry the Notion id suffix; compare case/accent-insensitive on the visible title. */
export function normaliseTitle(value: string): string {
  return value
    .normalize('NFC')
    .replace(NOTION_ID_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('it');
}

function attachFiles(titles: readonly string[], entries: readonly ImportEntry[], tablePath: string): Map<number, string[]> {
  const rowByTitle = new Map<string, number>();
  titles.forEach((title, index) => {
    const key = normaliseTitle(title);
    if (key !== '' && !rowByTitle.has(key)) rowByTitle.set(key, index);
  });
  const files = new Map<number, string[]>();
  for (const entry of entries) {
    if (entry.path === tablePath || isCsvPath(entry.path) || /\.(md|html)$/i.test(entry.path)) continue;
    const folders = entry.path.split('/').slice(0, -1);
    const row = folders.map((folder) => rowByTitle.get(normaliseTitle(folder))).find((index) => index !== undefined);
    if (row !== undefined) files.set(row, [...(files.get(row) ?? []), entry.path]);
  }
  return files;
}

function inspect(entry: ImportEntry, entries: readonly ImportEntry[]): { score: number; result: NotionExport } | null {
  let table: ParsedTable;
  try {
    table = parseCsv(entry.bytes);
  } catch {
    return null;
  }
  const titleColumn = table.headers.find((header) => TITLE_HEADER.test(header));
  if (!titleColumn) return null;
  const filesByRow = attachFiles(
    table.rows.map((row) => row[titleColumn] ?? ''),
    entries,
    entry.path,
  );
  const hasMarker = table.headers.some((header) => MARKER_HEADER.test(header));
  if (!hasMarker && filesByRow.size === 0) return null;
  return { score: filesByRow.size, result: { ...table, tablePath: entry.path, titleColumn, filesByRow } };
}

/** Finds the database CSV of a Notion export (best attachment match wins; the `_all.csv` twin loses ties). */
export function findNotionExport(entries: readonly ImportEntry[]): NotionExport | null {
  const found = entries
    .filter((entry) => isCsvPath(entry.path))
    .map((entry) => inspect(entry, entries))
    .filter((item): item is { score: number; result: NotionExport } => item !== null)
    .sort((a, b) => b.score - a.score || Number(/_all\.csv$/i.test(a.result.tablePath)) - Number(/_all\.csv$/i.test(b.result.tablePath)));
  return found[0]?.result ?? null;
}

export function parseNotionExport(entries: readonly ImportEntry[]): NotionExport {
  const found = findNotionExport(entries);
  if (!found) throw new ImportError('not_notion_export', 'No Notion database CSV found in the export.');
  return found;
}
