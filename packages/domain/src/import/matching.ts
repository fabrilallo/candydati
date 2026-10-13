import type {
  ImportConfidence,
  ImportConflict,
  ImportExistingRef,
  ImportFlag,
  ImportItemProposal,
  ParsedImportCv,
  ParsedImportRow,
} from './import.js';
import type { ImportMapping } from './mapping.js';
import { safePersonNameOrEmpty } from '../candidate/person-name.js';
import { fileStem, nameFromFileName, nameKey, nameSimilarity, normalizeEmail, normalizeText, phoneDigits, splitFullName } from './names.js';

/** Fuzzy name pairing needs at least this Levenshtein ratio, and a clear winner. */
export const FUZZY_NAME_THRESHOLD = 0.85;
const FUZZY_MARGIN = 0.04;

export interface MatchInput {
  readonly cvs: readonly ParsedImportCv[];
  readonly rows: readonly ParsedImportRow[];
  readonly mapping: ImportMapping;
  /** Existing candidates of the organization by lowercase email. */
  readonly existingByEmail: Readonly<Record<string, ImportExistingRef>>;
}

export interface MatchedItem extends ImportItemProposal {
  /** Default for the preview: items with a CV and enough certainty. */
  readonly included: boolean;
}

interface RowRecord {
  readonly indexes: readonly number[];
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly linkedinUrl: string | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  readonly file: string | null;
  readonly merged: boolean;
}

interface CvRecord {
  readonly cv: ParsedImportCv;
  readonly extraFiles: readonly string[];
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly merged: boolean;
}

const clean = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
const orNull = (value: string): string | null => (value === '' ? null : value);

function splitTags(value: string): readonly string[] {
  return [...new Set(value.split(/[,;|\n]+/).map((tag) => tag.trim().toLowerCase().slice(0, 40)).filter((tag) => tag !== ''))];
}

function linkedinOf(value: string): string | null {
  if (value === '') return null;
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return /linkedin\.com/i.test(url) ? url.slice(0, 300) : null;
}

function toRowRecord(row: ParsedImportRow, mapping: ImportMapping): RowRecord {
  const cell = (header: string | null): string => (header === null ? '' : clean(row.cells[header]));
  const split = cell(mapping.fullName) !== '' ? splitFullName(cell(mapping.fullName)) : null;
  return {
    indexes: [row.index],
    firstName: safePersonNameOrEmpty(cell(mapping.firstName) || split?.firstName || ''),
    lastName: safePersonNameOrEmpty(cell(mapping.lastName) || split?.lastName || ''),
    email: normalizeEmail(cell(mapping.email)),
    phone: orNull(cell(mapping.phone).slice(0, 40)),
    linkedinUrl: linkedinOf(cell(mapping.linkedin)),
    note: orNull(mapping.notes === null ? '' : (row.cells[mapping.notes] ?? '').trim()),
    tags: splitTags(cell(mapping.tags)),
    file: orNull(cell(mapping.file)),
    merged: false,
  };
}

const mergeRows = (a: RowRecord, b: RowRecord): RowRecord => ({
  indexes: [...a.indexes, ...b.indexes],
  firstName: a.firstName || b.firstName,
  lastName: a.lastName || b.lastName,
  email: a.email ?? b.email,
  phone: a.phone ?? b.phone,
  linkedinUrl: a.linkedinUrl ?? b.linkedinUrl,
  note: [a.note, b.note].filter((n): n is string => n !== null && n !== '').join('\n\n') || null,
  tags: [...new Set([...a.tags, ...b.tags])],
  file: a.file ?? b.file,
  merged: true,
});

/** The same email twice is the same person: rows are merged, the first non-empty value wins. */
function dedupeRows(rows: readonly RowRecord[]): readonly RowRecord[] {
  const byEmail = new Map<string, RowRecord>();
  const order: (string | RowRecord)[] = [];
  for (const row of rows) {
    if (row.email === null) {
      order.push(row);
      continue;
    }
    const seen = byEmail.get(row.email);
    if (seen) {
      byEmail.set(row.email, mergeRows(seen, row));
    } else {
      byEmail.set(row.email, row);
      order.push(row.email);
    }
  }
  return order.map((entry) => (typeof entry === 'string' ? (byEmail.get(entry) as RowRecord) : entry));
}

function toCvRecord(cv: ParsedImportCv, extraFiles: readonly string[] = [], merged = false): CvRecord {
  const fromText = clean(cv.name);
  return { cv, extraFiles, name: fromText !== '' ? fromText : nameFromFileName(cv.fileName), email: normalizeEmail(cv.email), phone: orNull(clean(cv.phone)), merged };
}

/** The same email in two CVs: the first stays, the others are listed as extra sources of the same person. */
function dedupeCvs(cvs: readonly ParsedImportCv[]): readonly CvRecord[] {
  const result: CvRecord[] = [];
  for (const cv of cvs) {
    const record = toCvRecord(cv);
    const same = record.email === null ? -1 : result.findIndex((r) => r.email === record.email);
    const found = result[same];
    if (found) result[same] = { ...found, extraFiles: [...found.extraFiles, cv.fileName], merged: true };
    else result.push(record);
  }
  return result;
}

interface Pair {
  readonly cv: CvRecord;
  readonly row: RowRecord | null;
  readonly basis: ImportItemProposal['basis'];
}

const fullNameOf = (row: RowRecord): string => `${row.firstName} ${row.lastName}`.trim();

type Finder = (cv: CvRecord, rows: readonly RowRecord[]) => RowRecord | null;

const byEmail: Finder = (cv, rows) => (cv.email === null ? null : (rows.find((row) => row.email === cv.email) ?? null));

const byFileName: Finder = (cv, rows) => {
  const stem = fileStem(cv.cv.fileName);
  return rows.find((row) => row.file !== null && row.file.split(/[,;|\n]+/).some((name) => fileStem(name) === stem)) ?? null;
};

/** Same words in any order. Two rows with the same name are homonyms: no guess. */
const byName: Finder = (cv, rows) => {
  const key = nameKey(cv.name);
  if (key === '') return null;
  const hits = rows.filter((row) => nameKey(fullNameOf(row)) === key);
  return hits.length === 1 ? (hits[0] ?? null) : null;
};

const byFuzzyName: Finder = (cv, rows) => {
  if (nameKey(cv.name) === '') return null;
  const scored = rows
    .map((row) => ({ row, score: nameSimilarity(cv.name, fullNameOf(row)) }))
    .filter((entry) => entry.score >= FUZZY_NAME_THRESHOLD)
    .toSorted((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || (second !== undefined && best.score - second.score < FUZZY_MARGIN)) return null;
  return best.row;
};

const STAGES: readonly { readonly basis: Pair['basis']; readonly find: Finder }[] = [
  { basis: 'email', find: byEmail },
  { basis: 'file_name', find: byFileName },
  { basis: 'name', find: byName },
  { basis: 'fuzzy_name', find: byFuzzyName },
];

/** Strongest evidence first across the whole batch, so a weak guess never steals a row from a sure match. */
function pairUp(cvs: readonly CvRecord[], rows: readonly RowRecord[]): { pairs: readonly Pair[]; leftover: readonly RowRecord[] } {
  const taken = new Map<number, Pair>();
  const usedRows = new Set<RowRecord>();
  for (const stage of STAGES) {
    cvs.forEach((cv, index) => {
      if (taken.has(index)) return;
      const row = stage.find(cv, rows.filter((candidate) => !usedRows.has(candidate)));
      if (!row) return;
      usedRows.add(row);
      taken.set(index, { cv, row, basis: stage.basis });
    });
  }
  return {
    pairs: cvs.map((cv, index) => taken.get(index) ?? { cv, row: null, basis: 'single' as const }),
    leftover: rows.filter((row) => !usedRows.has(row)),
  };
}

const sameName = (a: string, b: string): boolean => nameKey(a) === nameKey(b);

function existingConflicts(existing: ImportExistingRef, firstName: string, lastName: string, phone: string | null, linkedinUrl: string | null): readonly ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  const imported = `${firstName} ${lastName}`.trim();
  const current = `${existing.firstName} ${existing.lastName}`.trim();
  if (imported !== '' && !sameName(imported, current)) conflicts.push({ field: 'name', kind: 'existing', kept: current, other: imported });
  if (phone !== null && existing.phone !== null && phoneDigits(phone) !== phoneDigits(existing.phone)) {
    conflicts.push({ field: 'phone', kind: 'existing', kept: existing.phone, other: phone });
  }
  if (linkedinUrl !== null && existing.linkedinUrl !== null && normalizeText(linkedinUrl) !== normalizeText(existing.linkedinUrl)) {
    conflicts.push({ field: 'linkedinUrl', kind: 'existing', kept: existing.linkedinUrl, other: linkedinUrl });
  }
  return conflicts;
}

function sourceConflicts(cv: CvRecord, row: RowRecord): readonly ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  if (cv.email !== null && row.email !== null && cv.email !== row.email) conflicts.push({ field: 'email', kind: 'sources', kept: row.email, other: cv.email });
  if (cv.phone !== null && row.phone !== null && phoneDigits(cv.phone) !== phoneDigits(row.phone)) {
    conflicts.push({ field: 'phone', kind: 'sources', kept: row.phone, other: cv.phone });
  }
  return conflicts;
}

const CONFIDENCE: Readonly<Record<Pair['basis'], ImportConfidence>> = { email: 'high', file_name: 'high', name: 'medium', fuzzy_name: 'low', single: 'high' };

const safeNames = (name: { firstName: string; lastName: string }) => ({ firstName: safePersonNameOrEmpty(name.firstName), lastName: safePersonNameOrEmpty(name.lastName) });

function buildItem(cv: CvRecord | null, row: RowRecord | null, basis: Pair['basis'], existingByEmail: MatchInput['existingByEmail']): MatchedItem {
  const rowName = row ? { firstName: row.firstName, lastName: row.lastName } : null;
  const cvName = cv ? safeNames(splitFullName(cv.name)) : null;
  const name = rowName && (rowName.firstName !== '' || rowName.lastName !== '') ? rowName : (cvName ?? { firstName: '', lastName: '' });
  const email = row?.email ?? cv?.email ?? null;
  const phone = row?.phone ?? cv?.phone ?? null;
  const linkedinUrl = row?.linkedinUrl ?? null;
  const existing = email === null ? null : (existingByEmail[email] ?? null);
  const conflicts = [
    ...(cv && row ? sourceConflicts(cv, row) : []),
    ...(existing ? existingConflicts(existing, name.firstName, name.lastName, phone, linkedinUrl) : []),
  ];
  const flags: ImportFlag[] = [
    ...(email === null ? (['no_email'] as const) : []),
    ...(cv === null ? (['no_cv'] as const) : []),
    ...(name.firstName === '' || name.lastName === '' ? (['incomplete_name'] as const) : []),
    ...(existing ? (['existing_candidate'] as const) : []),
    ...((cv?.merged ?? false) || (row?.merged ?? false) ? (['duplicate_merged'] as const) : []),
    ...(conflicts.some((c) => c.field === 'email' && c.kind === 'sources') ? (['email_conflict'] as const) : []),
  ];
  const paired = cv !== null && row !== null;
  let confidence: ImportConfidence = paired ? CONFIDENCE[basis] : email === null ? 'medium' : 'high';
  // Two different emails behind a name match: probably two people with the same name.
  if (paired && flags.includes('email_conflict') && (basis === 'name' || basis === 'fuzzy_name')) confidence = 'low';
  return {
    confidence,
    basis: paired ? basis : 'single',
    candidate: {
      firstName: name.firstName,
      lastName: name.lastName,
      email,
      phone,
      linkedinUrl,
      tags: row?.tags ?? [],
      note: row?.note ?? null,
    },
    cv: cv ? { fileName: cv.cv.fileName, key: cv.cv.key } : null,
    headline: cv?.cv.extraction?.headline ?? null,
    sources: { rows: row?.indexes ?? [], files: cv ? [cv.cv.fileName, ...cv.extraFiles] : [] },
    existing,
    conflicts,
    flags,
    included: cv !== null && confidence !== 'low',
  };
}

/**
 * Crosses CVs with sheet rows (PRODUCT.md §3.1). Pairing evidence, strongest first: same email (high), the row names the CV
 * file (high), same name in any order, accents and case ignored (medium), fuzzy name (low). Duplicates inside the batch
 * (same email) are merged; people already in the database by email carry `existing` and the fields that differ.
 * Pure: no I/O. Items come CV first (in file order), then the rows without a CV.
 */
export function matchImport(input: MatchInput): readonly MatchedItem[] {
  const rows = dedupeRows(input.rows.map((row) => toRowRecord(row, input.mapping)).filter((row) => hasAnyData(row)));
  const cvs = dedupeCvs(input.cvs);
  const { pairs, leftover } = pairUp(cvs, rows);
  return [
    ...pairs.map((pair) => buildItem(pair.cv, pair.row, pair.basis, input.existingByEmail)),
    ...leftover.map((row) => buildItem(null, row, 'single', input.existingByEmail)),
  ];
}

const hasAnyData = (row: RowRecord): boolean => row.email !== null || row.firstName !== '' || row.lastName !== '' || row.file !== null;

/** Lowercase emails found in a batch (rows after the mapping, and CVs), to look the existing candidates up. */
export function collectImportEmails(cvs: readonly ParsedImportCv[], rows: readonly ParsedImportRow[], mapping: ImportMapping): readonly string[] {
  const emails = new Set<string>();
  for (const cv of cvs) {
    const email = normalizeEmail(cv.email);
    if (email) emails.add(email);
  }
  if (mapping.email !== null) {
    for (const row of rows) {
      const email = normalizeEmail(row.cells[mapping.email]);
      if (email) emails.add(email);
    }
  }
  return [...emails];
}
