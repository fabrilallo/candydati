import { IMPORT_LIMITS, type ParsedImportRow } from '@tt/domain';
import type { CvMediaType } from '@tt/domain';
import { sniffCv } from '../upload/sniff.js';
import { zipHasEntry } from '../upload/zip.js';
import { readImportArchive, type ImportEntry } from './archive.js';
import { classifyImportFiles } from './classify.js';
import { parseCsv } from './csv.js';
import { parseNotionExport } from './notion.js';
import type { ParsedTable } from './table.js';
import { parseXlsx } from './xlsx.js';

/** Header of the column added for Notion exports: the CV files attached to each row's page. */
export const NOTION_FILES_HEADER = 'Attached files';
const CELL_MAX = 10_000;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export interface SourceFile {
  readonly key: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/** A CV found among the uploaded files, not yet read. `sourceKey` is set when it was uploaded directly (already stored). */
export interface FoundCv {
  readonly fileName: string;
  readonly mediaType: CvMediaType;
  readonly bytes: Uint8Array;
  readonly sourceKey: string | null;
}

export interface Gathered {
  readonly headers: readonly string[];
  readonly rows: readonly ParsedImportRow[];
  readonly cvs: readonly FoundCv[];
  /** The Notion attachments column, when the export had one: the file mapping must point to it. */
  readonly filesColumn: string | null;
  readonly ignored: number;
}

/** A ZIP that is neither a DOCX nor an XLSX is an archive to open. */
const isArchive = (bytes: Uint8Array): boolean =>
  ZIP_MAGIC.every((value, index) => bytes[index] === value) && sniffCv(bytes, 'x') === null && !zipHasEntry(bytes, 'xl/workbook.xml');

const entriesOf = (source: SourceFile): readonly ImportEntry[] =>
  isArchive(source.bytes) ? readImportArchive(source.bytes) : [{ path: source.fileName, bytes: source.bytes }];

const clip = (cells: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(cells).map(([header, value]) => [header, value.slice(0, CELL_MAX)]));

interface Accumulator {
  headers: string[];
  rows: ParsedImportRow[];
  cvs: FoundCv[];
  filesColumn: string | null;
  ignored: number;
}

function addTable(acc: Accumulator, table: ParsedTable): void {
  for (const header of table.headers) if (!acc.headers.includes(header)) acc.headers.push(header);
  for (const row of table.rows) acc.rows.push({ index: acc.rows.length, cells: clip(row) });
}

function addNotion(acc: Accumulator, entries: readonly ImportEntry[], cvNames: ReadonlyMap<string, string>): void {
  const notion = parseNotionExport(entries);
  const withFiles = notion.rows.map((row, index) => {
    const names = (notion.filesByRow.get(index) ?? []).flatMap((path) => cvNames.get(path) ?? []);
    return { ...row, [NOTION_FILES_HEADER]: names.join(', ') };
  });
  const hasFiles = withFiles.some((row) => row[NOTION_FILES_HEADER] !== '');
  addTable(acc, { ...notion, headers: hasFiles ? [...notion.headers, NOTION_FILES_HEADER] : notion.headers, rows: hasFiles ? withFiles : notion.rows });
  if (hasFiles) acc.filesColumn ??= NOTION_FILES_HEADER;
}

async function addSource(acc: Accumulator, source: SourceFile): Promise<void> {
  const entries = entriesOf(source);
  const classified = classifyImportFiles(entries);
  acc.ignored += classified.ignored.length;
  const direct = entries.length === 1 && entries[0]?.path === source.fileName;
  for (const cv of classified.cvs) acc.cvs.push({ fileName: cv.fileName, mediaType: cv.mediaType, bytes: cv.bytes, sourceKey: direct ? source.key : null });
  if (classified.notionTablePath !== null) {
    addNotion(acc, entries, new Map(classified.cvs.map((cv) => [cv.path, cv.fileName])));
  }
  for (const table of classified.tables) addTable(acc, table.kind === 'xlsx' ? await parseXlsx(table.bytes) : parseCsv(table.bytes));
}

/**
 * Opens every uploaded file by its content: archives (never nested), CVs, CSV, XLSX and Notion exports (their rows get
 * a column naming the CV files attached to the page). Throws `ImportError` for an unsafe or unreadable archive or sheet.
 */
export async function gatherSources(sources: readonly SourceFile[]): Promise<Gathered> {
  const acc: Accumulator = { headers: [], rows: [], cvs: [], filesColumn: null, ignored: 0 };
  for (const source of sources) await addSource(acc, source);
  return {
    headers: acc.headers,
    rows: acc.rows.slice(0, IMPORT_LIMITS.maxRows),
    cvs: acc.cvs.slice(0, IMPORT_LIMITS.maxFiles),
    filesColumn: acc.filesColumn,
    ignored: acc.ignored,
  };
}
