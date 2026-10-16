import { MigrationFetchFailure } from '@candydati/core';
import { IMPORT_MAX_TABLE_BYTES, ImportError, openImportArchive, parseCsv, parseXlsx, type ImportArchive, type ParsedTable } from '../../../import/index.js';
import { sniffCv } from '../../../upload/sniff.js';
import { z } from 'zod';
import { defineMigrationConnector, type ConnectorTools } from '../../connector.js';
import type { PackageBuilder } from '../../package-builder.js';
import { detectColumns } from './columns.js';
import { matchCvs } from './cv-match.js';
import { mapSheet } from './map.js';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const isZip = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((value, index) => bytes[index] === value);

/** CSV or XLSX, told by content (an XLSX is a ZIP). Anything unreadable is `input_unreadable`, with no detail. */
async function readTable(bytes: Uint8Array): Promise<ParsedTable> {
  try {
    if (bytes.byteLength > IMPORT_MAX_TABLE_BYTES) throw new MigrationFetchFailure('input_unreadable');
    const table = isZip(bytes) ? await parseXlsx(bytes) : parseCsv(bytes);
    // Cut silently, a migration would lose people without saying so: the operator splits the file instead.
    if (table.headers.length === 0 || table.rows.length === 0 || table.truncated) throw new MigrationFetchFailure('input_unreadable');
    return table;
  } catch (error) {
    if (error instanceof MigrationFetchFailure) throw error;
    if (error instanceof ImportError) throw new MigrationFetchFailure('input_unreadable');
    throw error;
  }
}

interface ArchivedCv {
  readonly name: string;
  readonly path: string;
}

/** The CVs of the ZIP: PDF or DOCX by content, never by name. Everything else in the archive is left out. */
function openCvArchive(bytes: Uint8Array): { readonly archive: ImportArchive; readonly cvs: readonly ArchivedCv[] } {
  let archive: ImportArchive;
  try {
    archive = openImportArchive(bytes);
  } catch (error) {
    if (error instanceof ImportError) throw new MigrationFetchFailure('input_unreadable');
    throw error;
  }
  const cvs: ArchivedCv[] = [];
  for (const entry of archive.entries) {
    const head = archive.inflate(entry.name);
    if (sniffCv(head, entry.path) !== null) cvs.push({ name: entry.name, path: entry.path });
  }
  return { archive, cvs };
}

async function attachCvs(builder: PackageBuilder, archive: ImportArchive, cvs: readonly ArchivedCv[], byApplication: ReadonlyMap<string, number>): Promise<void> {
  for (const [applicationRef, index] of byApplication) {
    const cv = cvs[index];
    if (cv === undefined) continue;
    const bytes = archive.inflate(cv.name);
    const sniffed = sniffCv(bytes, cv.path);
    await builder.addFile(applicationRef, { kind: 'cv', fileName: cv.path.split('/').pop() ?? cv.path }, (store) =>
      store(
        (async function* () {
          yield bytes;
        })(),
        sniffed?.mediaType ?? null,
      ),
    );
  }
}

/**
 * Zucchetti InRecruiting has no public API: access to the data goes through the vendor's support. This connector reads
 * the full export the operator obtains (a spreadsheet, and optionally a ZIP of the CVs) and maps it to the package.
 * ASSUMED, not verified on a real export: column names (see `columns.ts`). Scores and ratings are never imported.
 */
export const inrecruitingConnector = defineMigrationConnector({
  id: 'inrecruiting',
  label: 'Zucchetti InRecruiting',
  maturity: 'beta',
  input: 'files',
  docsUrl: 'https://docs.kombo.dev/ats/connectors/inrecruiting',
  fields: [],
  credentials: z.strictObject({}),
  // Nothing to reach: the reader is limited to no host at all.
  hosts: () => [],
  async fetch(_credentials, builder, tools: ConnectorTools) {
    if (tools.files === undefined) throw new MigrationFetchFailure('fetch_interrupted');
    const table = await readTable(await tools.files.sheet());
    const detection = detectColumns(table.headers);
    if (detection.missing.length > 0) throw new MigrationFetchFailure('input_columns_missing');
    const exportedAt = new Date().toISOString();
    const mapped = mapSheet(table.rows, detection, exportedAt);
    await tools.progress(0, mapped.applications.length);
    for (const job of mapped.jobs) builder.addJob(job);
    for (const candidate of mapped.candidates) builder.addCandidate(candidate);
    for (const application of mapped.applications) builder.addApplication(application);
    for (const note of mapped.notes) builder.addNote(note);
    const zip = await tools.files.cvs();
    const unmatched = zip === null ? 0 : await addCvs(builder, zip, mapped.subjects);
    for (const notice of mapped.notices) tools.notice(notice);
    if (unmatched > 0) tools.notice({ code: 'cvs_unmatched', count: unmatched });
    await tools.progress(mapped.applications.length, mapped.applications.length);
  },
});

async function addCvs(builder: PackageBuilder, zip: Uint8Array, subjects: Parameters<typeof matchCvs>[0]): Promise<number> {
  const { archive, cvs } = openCvArchive(zip);
  const matches = matchCvs(subjects, cvs.map((cv) => cv.path));
  await attachCvs(builder, archive, cvs, matches.byApplication);
  return matches.unmatched;
}
