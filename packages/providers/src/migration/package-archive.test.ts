import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { MigrationPackageInput } from '@candydati/domain';
import { makeLyingBomb, makeZip, makePdf, type ZipEntrySpec } from '../testing/fixtures.js';
import { MigrationPackageError, openMigrationPackage } from './package-archive.js';

const manifest: MigrationPackageInput = {
  format: 'candydati-migration',
  version: 1,
  source: { system: 'teamtailor', exportedAt: '2026-10-01T10:00:00Z', producer: 'test' },
  jobs: [{ ref: 'j1', title: 'Backend Developer', status: 'open', createdAt: '2025-01-10T09:00:00Z', stages: [{ ref: 's1', name: 'Colloquio' }] }],
  candidates: [{ ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', createdAt: '2025-01-12T09:00:00Z' }],
  applications: [
    {
      ref: 'a1',
      candidateRef: 'c1',
      jobRef: 'j1',
      stageRef: 's1',
      createdAt: '2025-01-12T09:00:00Z',
      files: [
        { path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv.pdf' },
        { path: 'files/a1/lettera.txt', kind: 'cover_letter', fileName: 'lettera.txt' },
      ],
    },
  ],
};

const cv = makePdf(['Ada Bianchi']);
const manifestEntry = (value: unknown = manifest): ZipEntrySpec => ({ name: 'migration.json', content: JSON.stringify(value) });
const validEntries: readonly ZipEntrySpec[] = [
  manifestEntry(),
  { name: 'files/a1/cv.pdf', content: cv },
  { name: 'files/a1/lettera.txt', content: 'Buongiorno' },
];

async function errorOf(input: Uint8Array | AsyncIterable<Uint8Array>, options?: Parameters<typeof openMigrationPackage>[1]) {
  try {
    await openMigrationPackage(input, options);
  } catch (error) {
    if (error instanceof MigrationPackageError) return error;
    throw error;
  }
  throw new Error('expected a MigrationPackageError');
}

async function* chunks(bytes: Uint8Array, size = 7): AsyncIterable<Uint8Array> {
  for (let at = 0; at < bytes.byteLength; at += size) yield bytes.subarray(at, at + size);
}

describe('openMigrationPackage', () => {
  it('returns the parsed manifest and a reader for every referenced file', async () => {
    const opened = await openMigrationPackage(makeZip([...validEntries, { name: 'files/', content: '' }]));
    expect(opened.manifest.applications[0]?.ref).toBe('a1');
    expect([...opened.files.keys()].sort()).toEqual(['files/a1/cv.pdf', 'files/a1/lettera.txt']);
    expect(opened.files.get('files/a1/cv.pdf')?.size).toBe(cv.byteLength);
    expect(await opened.files.get('files/a1/cv.pdf')?.read()).toEqual(cv);
    expect(new TextDecoder().decode(await opened.files.get('files/a1/lettera.txt')?.read())).toBe('Buongiorno');
    expect(opened.unreferenced).toEqual([]);
  });

  it('reads a package from a stream of chunks', async () => {
    const opened = await openMigrationPackage(chunks(makeZip(validEntries)));
    expect(opened.files.size).toBe(2);
  });

  it('refuses a stream larger than the archive cap', async () => {
    const error = await errorOf(chunks(makeZip(validEntries)), { maxArchiveBytes: 100 });
    expect(error.code).toBe('too_large');
  });

  it('reports files present but not referenced, without failing', async () => {
    const opened = await openMigrationPackage(makeZip([...validEntries, { name: 'files/extra/foto.jpg', content: 'x' }]));
    expect(opened.unreferenced).toEqual(['files/extra/foto.jpg']);
    expect(opened.files.has('files/extra/foto.jpg')).toBe(false);
  });

  it('refuses a package without migration.json', async () => {
    expect((await errorOf(makeZip(validEntries.slice(1)))).code).toBe('missing_manifest');
  });

  it('refuses a manifest that is not JSON', async () => {
    const error = await errorOf(makeZip([{ name: 'migration.json', content: '{nope' }, ...validEntries.slice(1)]));
    expect(error.code).toBe('invalid_manifest');
  });

  it('refuses a manifest that breaks the schema and lists the issues', async () => {
    const bad = { ...manifest, candidates: [{ ...manifest.candidates[0], score: 9 }] };
    const error = await errorOf(makeZip([manifestEntry(bad), ...validEntries.slice(1)]));
    expect(error.code).toBe('invalid_manifest');
    expect(error.details.join('\n')).toContain('candidates.0');
  });

  it('refuses files referenced but absent, naming them', async () => {
    const error = await errorOf(makeZip(validEntries.slice(0, 2)));
    expect(error.code).toBe('missing_files');
    expect(error.details).toEqual(['files/a1/lettera.txt']);
  });

  it.each(['other/readme.txt', '__MACOSX/files/a1/._cv.pdf', 'files/a1/.DS_Store', '.hidden'])('refuses the entry %s', async (name) => {
    const error = await errorOf(makeZip([...validEntries, { name, content: 'x' }]));
    expect(error.code).toBe('unexpected_entry');
    expect(error.details).toEqual([name]);
  });

  it.each(['../evil.pdf', '/files/a.pdf', 'files/../migration.json', 'files//a.pdf', 'files\\a.pdf'])('refuses the unsafe path %s', async (name) => {
    expect((await errorOf(makeZip([...validEntries, { name, content: 'x' }]))).code).toBe('unsafe_path');
  });

  it('refuses the same entry twice', async () => {
    const error = await errorOf(makeZip([...validEntries, { name: 'files/a1/cv.pdf', content: 'x' }]));
    expect(error.code).toBe('duplicate_entry');
  });

  it('refuses symbolic links', async () => {
    const zip = zipSync({
      'migration.json': strToU8(JSON.stringify(manifest)),
      'files/a1/cv.pdf': [strToU8('/etc/passwd'), { os: 3, attrs: 0o120777 << 16 }],
    } as Zippable);
    expect((await errorOf(zip)).code).toBe('symlink');
  });

  it('refuses data that is not a ZIP', async () => {
    expect((await errorOf(strToU8('not a zip'))).code).toBe('invalid_archive');
  });

  it('refuses a manifest that inflates past what it declares (zip bomb)', async () => {
    expect((await errorOf(makeLyingBomb('migration.json', 4 * 1024 * 1024, 1000))).code).toBe('too_large');
  });

  it('refuses a file that inflates past what it declares when it is read', async () => {
    const lying = makeZip([validEntries[0]!, { name: 'files/a1/cv.pdf', content: cv, declaredSize: 10 }, validEntries[2]!]);
    const opened = await openMigrationPackage(lying);
    await expect(opened.files.get('files/a1/cv.pdf')?.read()).rejects.toMatchObject({ code: 'too_large' });
  });

  it('refuses a manifest larger than its cap and an archive over the size and entry limits', async () => {
    const zip = makeZip(validEntries);
    expect((await errorOf(zip, { limits: { manifestBytes: 10 } })).code).toBe('too_large');
    expect((await errorOf(zip, { limits: { maxTotalBytes: 100 } })).code).toBe('too_large');
    expect((await errorOf(zip, { limits: { maxEntries: 2 } })).code).toBe('too_many_entries');
    expect((await errorOf(makeZip([...validEntries, { name: 'files/big.bin', content: cv, declaredSize: 10_000_000 }]))).code).toBe('ratio_exceeded');
  });
});
