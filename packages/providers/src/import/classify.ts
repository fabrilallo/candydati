import { sniffCv } from '../upload/sniff.js';
import { zipHasEntry } from '../upload/zip.js';
import type { CvMediaType } from '@tt/domain';
import type { ImportEntry } from './archive.js';
import { decodeText } from './csv.js';
import { findNotionExport } from './notion.js';

export type IgnoredReason = 'empty_file' | 'nested_archive' | 'not_a_table' | 'unsupported_type';

export interface ClassifiedCv extends ImportEntry {
  readonly mediaType: CvMediaType;
  readonly fileName: string;
}

export interface ClassifiedTable extends ImportEntry {
  readonly kind: 'csv' | 'xlsx';
}

export interface IgnoredFile {
  readonly path: string;
  readonly reason: IgnoredReason;
}

export interface ClassifiedImport {
  readonly cvs: readonly ClassifiedCv[];
  readonly tables: readonly ClassifiedTable[];
  /** Path of the Notion database CSV when the export looks like a Notion one (it is not repeated in `tables`). */
  readonly notionTablePath: string | null;
  readonly ignored: readonly IgnoredFile[];
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const SNIFF_BYTES = 4096;

const isZip = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((value, index) => bytes[index] === value);
const isXlsx = (bytes: Uint8Array): boolean => isZip(bytes) && zipHasEntry(bytes, 'xl/workbook.xml');

function looksLikeCsv(entry: ImportEntry): boolean {
  if (!/\.(csv|tsv)$/i.test(entry.path)) return false;
  const head = entry.bytes.subarray(0, SNIFF_BYTES);
  if (head.includes(0)) return false;
  const text = decodeText(head);
  return /[,;\t]/.test(text.split(/\r?\n/)[0] ?? '');
}

type Classified =
  | { readonly kind: 'cv'; readonly value: ClassifiedCv }
  | { readonly kind: 'table'; readonly value: ClassifiedTable }
  | { readonly kind: 'ignored'; readonly value: IgnoredFile };

function classifyOne(entry: ImportEntry): Classified {
  const ignored = (reason: IgnoredReason): Classified => ({ kind: 'ignored', value: { path: entry.path, reason } });
  if (entry.bytes.byteLength === 0) return ignored('empty_file');
  const cv = sniffCv(entry.bytes, entry.path.split('/').at(-1) ?? entry.path);
  if (cv) return { kind: 'cv', value: { ...entry, mediaType: cv.mediaType, fileName: cv.fileName } };
  if (isXlsx(entry.bytes)) return { kind: 'table', value: { ...entry, kind: 'xlsx' } };
  if (isZip(entry.bytes)) return ignored('nested_archive');
  if (/\.(csv|tsv)$/i.test(entry.path)) return looksLikeCsv(entry) ? { kind: 'table', value: { ...entry, kind: 'csv' } } : ignored('not_a_table');
  return ignored('unsupported_type');
}

/** Sorts archive entries by their content (never by name alone); whatever is not usable is listed with a reason. */
export function classifyImportFiles(entries: readonly ImportEntry[]): ClassifiedImport {
  const results = entries.map(classifyOne);
  const cvs = results.flatMap((r) => (r.kind === 'cv' ? [r.value] : []));
  const tables = results.flatMap((r) => (r.kind === 'table' ? [r.value] : []));
  const ignored = results.flatMap((r) => (r.kind === 'ignored' ? [r.value] : []));
  const csvPaths = new Set(tables.filter((table) => table.kind === 'csv').map((table) => table.path));
  const candidates = entries.filter((entry) => csvPaths.has(entry.path) || !/\.csv$/i.test(entry.path));
  const notionTablePath = findNotionExport(candidates)?.tablePath ?? null;
  return { cvs, tables: tables.filter((table) => table.path !== notionTablePath), notionTablePath, ignored };
}
