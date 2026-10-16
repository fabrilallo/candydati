import { createInMemoryFileStorage } from '@candydati/core/testing';
import type { MigrationPackageInput } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { makePdf, makeZip } from '../testing/fixtures.js';
import { createMigrationPackageReader } from './package-reader.js';

const manifest: MigrationPackageInput = {
  format: 'candydati-migration',
  version: 1,
  source: { system: 'workable', exportedAt: '2026-10-01T10:00:00Z', producer: 'test' },
  jobs: [{ ref: 'j1', title: 'Backend Developer', status: 'open', createdAt: '2025-01-10T09:00:00Z', stages: [{ ref: 's1', name: 'Colloquio' }] }],
  candidates: [{ ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', createdAt: '2025-01-12T09:00:00Z' }],
  applications: [
    { ref: 'a1', candidateRef: 'c1', jobRef: 'j1', stageRef: 's1', createdAt: '2025-01-12T09:00:00Z', files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }] },
  ],
};

const KEY = 'organizations/org_a/migrations/mig_1/package.zip';

describe('createMigrationPackageReader', () => {
  it('opens a stored package: manifest, files read on demand, unreferenced files', async () => {
    const cv = makePdf(['Ada Bianchi']);
    const files = createInMemoryFileStorage({
      [KEY]: makeZip([
        { name: 'migration.json', content: JSON.stringify(manifest) },
        { name: 'files/a1/cv.pdf', content: cv },
        { name: 'files/extra.txt', content: 'x' },
      ]),
    });
    const result = await createMigrationPackageReader(files).open(KEY);
    if (!result.ok) throw new Error(`refused: ${result.code}`);
    expect(result.package.manifest.source.system).toBe('workable');
    expect(result.package.unreferenced).toEqual(['files/extra.txt']);
    expect(await result.package.files.get('files/a1/cv.pdf')?.read()).toEqual(cv);
  });

  it('turns a refused package into its code and details', async () => {
    const files = createInMemoryFileStorage({ [KEY]: makeZip([{ name: 'migration.json', content: '{"format":"other"}' }]) });
    const result = await createMigrationPackageReader(files).open(KEY);
    expect(result).toMatchObject({ ok: false, code: 'invalid_manifest' });
    expect(result.ok ? [] : result.details.length).toBeGreaterThan(0);
  });

  it('refuses a stream over the size cap, and throws when the package is not in storage', async () => {
    const files = createInMemoryFileStorage({ [KEY]: makeZip([{ name: 'migration.json', content: JSON.stringify(manifest) }]) });
    expect(await createMigrationPackageReader(files, { maxArchiveBytes: 10 }).open(KEY)).toMatchObject({ ok: false, code: 'too_large' });
    await expect(createMigrationPackageReader(files).open('organizations/org_a/migrations/none/package.zip')).rejects.toThrow('No such file');
  });
});
