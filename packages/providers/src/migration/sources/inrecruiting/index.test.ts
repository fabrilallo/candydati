import { MigrationFetchFailure, type MigrationFetchRequest, type MigrationInputFiles } from '@candydati/core';
import { createInMemoryFileStorage } from '@candydati/core/testing';
import { migrationFilePrefix, migrationPackageKey, parseMigrationPackage } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { makeZip } from '../../../testing/fixtures.js';
import { createMigrationFetcher } from '../../fetcher.js';
import { createMigrationPackageReader } from '../../package-reader.js';
import { createConnectorRegistry } from '../../registry.js';
import { assumedCsv, assumedCvZip, assumedXlsx, csvOf } from './inrecruiting-fixtures.js';
import { inrecruitingConnector } from './index.js';

const ORG = 'org_a';
const BATCH = 'mig_1';

const filesOf = (sheet: Uint8Array, cvs: Uint8Array | null): MigrationInputFiles => ({ sheet: async () => sheet, cvs: async () => cvs });

const request = (inputFiles: MigrationInputFiles | undefined): MigrationFetchRequest => ({
  organizationId: ORG,
  batchId: BATCH,
  connectorId: 'inrecruiting',
  credentials: {},
  inputFiles,
  filePrefix: migrationFilePrefix(ORG, BATCH),
  partKey: (index) => migrationPackageKey(ORG, index === 0 ? BATCH : `${BATCH}_p${index + 1}`),
  progress: async () => undefined,
  reserveFiles: async () => undefined,
});

const run = async (inputFiles: MigrationInputFiles | undefined) => {
  const files = createInMemoryFileStorage();
  const fetcher = createMigrationFetcher({ registry: createConnectorRegistry([inrecruitingConnector]), files, now: () => new Date('2026-10-16T10:00:00Z') });
  return { files, fetcher, result: fetcher.fetch(request(inputFiles)) };
};

describe('the inrecruiting connector', () => {
  it('is a beta file connector with no credentials, no hosts, and a public description the registry accepts', () => {
    expect(inrecruitingConnector).toMatchObject({ id: 'inrecruiting', maturity: 'beta', input: 'files', fields: [] });
    expect(inrecruitingConnector.hosts({})).toEqual([]);
    expect(createConnectorRegistry([inrecruitingConnector]).get('inrecruiting')).toBe(inrecruitingConnector);
  });

  it.each([
    ['a CSV', async () => assumedCsv()],
    ['an XLSX', assumedXlsx],
  ])('turns %s and a ZIP of CVs into a package parseMigrationPackage accepts, with the CVs matched and nothing else left over', async (_name, sheet) => {
    const { files, result } = await run(filesOf(await sheet(), assumedCvZip()));
    const done = await result;
    expect(done.parts).toHaveLength(1);
    expect(done.parts[0]?.counts).toMatchObject({ jobs: 2, candidates: 6, applications: 7, notes: 2, files: 3 });
    expect(done.notices).toEqual([
      { code: 'columns_unrecognized', count: 1, headers: ['Taglia scarpe'] },
      { code: 'columns_ignored', count: 1, headers: ['Valutazione'] },
      { code: 'rows_skipped', count: 1 },
      { code: 'rows_duplicate', count: 1 },
      { code: 'values_dropped', count: 3 },
      { code: 'cvs_unmatched', count: 1 },
    ]);
    const opened = await createMigrationPackageReader(files).open(migrationPackageKey(ORG, BATCH));
    if (!opened.ok) throw new Error(`refused: ${opened.code} ${opened.details.join(',')}`);
    const parsed = parseMigrationPackage(opened.package.manifest);
    expect(parsed.success).toBe(true);
    const manifest = opened.package.manifest;
    expect(manifest.source).toEqual({ system: 'inrecruiting', producer: 'connector:inrecruiting@1', exportedAt: '2026-10-16T10:00:00.000Z' });
    const cvOf = (ref: string) => manifest.applications.find((a) => a.ref === ref)?.files.map((f) => f.fileName);
    expect(cvOf('application-1')).toEqual(['Mario_Rossi_CV.pdf']);
    expect(cvOf('application-5')).toEqual(['Giulia Neri.pdf']);
    expect(cvOf('application-6')).toEqual(['cv_paolo.gialli@example.com.pdf']);
    expect(opened.package.unreferenced).toEqual([]);
    expect(files.keys()).toEqual([migrationPackageKey(ORG, BATCH)]);
  });

  it('works without CVs', async () => {
    const { result } = await run(filesOf(assumedCsv(), null));
    expect((await result).parts[0]?.counts).toMatchObject({ applications: 7, files: 0 });
  });

  it('fails with the columns code when the name or the job column is missing', async () => {
    const { result } = await run(filesOf(csvOf(['Email', 'Stato'], [['a@example.com', 'Nuovo']]), null));
    await expect(result).rejects.toEqual(new MigrationFetchFailure('input_columns_missing'));
  });

  it.each([
    ['an empty file', new Uint8Array()],
    ['a header and no rows', csvOf(['Nome e cognome', 'Posizione'], [])],
    ['a ZIP that is not a workbook', makeZip([{ name: 'a.txt', content: 'x' }])],
    ['a file far too large for a sheet', new Uint8Array(26 * 1024 * 1024)],
  ])('fails as unreadable on %s', async (_name, sheet) => {
    const { result } = await run(filesOf(sheet, null));
    await expect(result).rejects.toEqual(new MigrationFetchFailure('input_unreadable'));
  });

  it('fails as unreadable when the CV archive is not a ZIP, or when the sheet has more rows than can be read', async () => {
    const broken = await run(filesOf(assumedCsv(), new Uint8Array([1, 2, 3])));
    await expect(broken.result).rejects.toEqual(new MigrationFetchFailure('input_unreadable'));
    const rows = Array.from({ length: 5001 }, (_, i) => [`Persona ${i}`, 'Analyst']);
    const long = await run(filesOf(csvOf(['Nome e cognome', 'Posizione'], rows), null));
    await expect(long.result).rejects.toEqual(new MigrationFetchFailure('input_unreadable'));
  });

  it('refuses to run without the uploaded files, and leaves nothing in storage after a failure', async () => {
    const none = await run(undefined);
    await expect(none.result).rejects.toEqual(new MigrationFetchFailure('fetch_interrupted'));
    const bad = await run(filesOf(csvOf(['Email'], [['a@example.com']]), assumedCvZip()));
    await expect(bad.result).rejects.toBeInstanceOf(MigrationFetchFailure);
    expect(bad.files.keys()).toEqual([]);
  });
});
