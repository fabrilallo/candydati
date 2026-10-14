import { IMPORT_LIMITS, type ParsedImportRow } from '@tt/domain';
import type { CvMediaType } from '@tt/domain';
import { sniffCv } from '../upload/sniff.js';
import { zipHasEntry } from '../upload/zip.js';
import { openImportArchive, type ImportEntry } from './archive.js';
import { classifyOne, summariseClassified, type Classified } from './classify.js';
import { parseCsv } from './csv.js';
import { DEFAULT_IMPORT_LIMITS, IMPORT_MAX_TABLE_BYTES, ImportError, type ImportLimits } from './limits.js';
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

/** A CV found among the uploaded files. `sourceKey` is set when it was uploaded directly (already stored). */
export interface FoundCv {
  readonly fileName: string;
  readonly mediaType: CvMediaType;
  readonly bytes: Uint8Array;
  readonly sourceKey: string | null;
}

/** Receives each CV as it is found. It should store and read it, then let go of `bytes`: they are not kept. */
export type CvHandler = (cv: FoundCv) => Promise<void>;

export interface Gathered {
  readonly headers: readonly string[];
  readonly rows: readonly ParsedImportRow[];
  /** Number of CVs handed to the handler. */
  readonly cvCount: number;
  /** The Notion attachments column, when the export had one: the file mapping must point to it. */
  readonly filesColumn: string | null;
  readonly ignored: number;
}

/** A ZIP that is neither a DOCX nor an XLSX is an archive to open. */
const isArchive = (bytes: Uint8Array): boolean =>
  ZIP_MAGIC.every((value, index) => bytes[index] === value) && sniffCv(bytes, 'x') === null && !zipHasEntry(bytes, 'xl/workbook.xml');

const clip = (cells: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(cells).map(([header, value]) => [header, value.slice(0, CELL_MAX)]));

/** What is left of the batch limits: shared by all its files. */
interface Budget {
  entries: number;
  bytes: number;
}

interface Accumulator {
  headers: string[];
  rows: ParsedImportRow[];
  cvCount: number;
  filesColumn: string | null;
  ignored: number;
  readonly budget: Budget;
  readonly onCv: CvHandler;
}

function spend(budget: Budget, entries: number, bytes: number): void {
  budget.entries -= entries;
  budget.bytes -= bytes;
  if (budget.entries < 0) throw new ImportError('too_many_entries', 'The batch has too many entries.');
  if (budget.bytes < 0) throw new ImportError('too_large', 'The batch expands to too much data.');
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

const EMPTY = new Uint8Array(0);

/** A CV goes to the handler right away; a table is kept (capped); everything else is only counted. Returns what is kept of the entry. */
async function takeEntry(acc: Accumulator, entry: ImportEntry, sourceKey: string | null): Promise<{ readonly result: Classified; readonly kept: ImportEntry }> {
  const result = classifyOne(entry);
  if (result.kind === 'cv') {
    if (acc.cvCount < IMPORT_LIMITS.maxFiles) {
      acc.cvCount += 1;
      await acc.onCv({ fileName: result.value.fileName, mediaType: result.value.mediaType, bytes: entry.bytes, sourceKey });
    }
    return { result, kept: { path: entry.path, bytes: EMPTY } };
  }
  if (result.kind === 'table') {
    if (entry.bytes.byteLength > IMPORT_MAX_TABLE_BYTES) throw new ImportError('too_large', 'A sheet is too large.');
    return { result, kept: entry };
  }
  return { result, kept: { path: entry.path, bytes: EMPTY } };
}

async function addTables(acc: Accumulator, results: readonly Classified[], light: readonly ImportEntry[], cvNames: ReadonlyMap<string, string>): Promise<void> {
  const classified = summariseClassified(results, light);
  acc.ignored += classified.ignored.length;
  if (classified.notionTablePath !== null) addNotion(acc, light, cvNames);
  for (const table of classified.tables) addTable(acc, table.kind === 'xlsx' ? await parseXlsx(table.bytes) : parseCsv(table.bytes));
}

async function addSource(acc: Accumulator, source: SourceFile, limits: ImportLimits): Promise<void> {
  if (!isArchive(source.bytes)) {
    spend(acc.budget, 1, source.bytes.byteLength);
    const { result, kept } = await takeEntry(acc, { path: source.fileName, bytes: source.bytes }, source.key);
    const names = new Map(result.kind === 'cv' ? [[source.fileName, result.value.fileName]] : []);
    return addTables(acc, [result], [kept], names);
  }
  const archive = openImportArchive(source.bytes, { ...limits, maxEntries: acc.budget.entries, maxTotalBytes: acc.budget.bytes });
  spend(acc.budget, archive.entryCount, archive.declaredBytes);
  const results: Classified[] = [];
  const light: ImportEntry[] = [];
  const cvNames = new Map<string, string>();
  for (const info of archive.entries) {
    const { result, kept } = await takeEntry(acc, { path: info.path, bytes: archive.inflate(info.name) }, null);
    results.push(result);
    light.push(kept);
    if (result.kind === 'cv') cvNames.set(info.path, result.value.fileName);
  }
  await addTables(acc, results, light, cvNames);
}

/**
 * Opens every uploaded file by its content: archives (never nested), CVs, CSV, XLSX and Notion exports (their rows get
 * a column naming the CV files attached to the page). Throws `ImportError` for an unsafe or unreadable archive or sheet,
 * or when the batch as a whole exceeds the limits (entries and expanded bytes are shared by all its files).
 *
 * Memory: `sources` is pulled one file at a time and each CV is handed to `onCv` and forgotten, so only one source, the
 * tables and the CVs the handler still holds are in memory.
 */
export async function gatherSources(sources: AsyncIterable<SourceFile> | Iterable<SourceFile>, onCv: CvHandler, limits: ImportLimits = DEFAULT_IMPORT_LIMITS): Promise<Gathered> {
  const acc: Accumulator = { headers: [], rows: [], cvCount: 0, filesColumn: null, ignored: 0, budget: { entries: limits.maxEntries, bytes: limits.maxTotalBytes }, onCv };
  for await (const source of sources) await addSource(acc, source, limits);
  return { headers: acc.headers, rows: acc.rows.slice(0, IMPORT_LIMITS.maxRows), cvCount: acc.cvCount, filesColumn: acc.filesColumn, ignored: acc.ignored };
}
