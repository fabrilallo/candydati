import { migrationPackageKey, parseMigrationPackage, type MigrationBatch, type MigrationPackageInput } from '@candydati/domain';
import type { MigrationPackageEntry, MigrationPackageOpenResult } from '../migration-ports.js';
import { createMigrationFromPackage } from '../use-cases/migrations/create-migration.js';
import { analyzeMigration } from '../use-cases/migrations/analyze-migration.js';
import { userActor } from './actors.js';
import { ORG_A } from './candidate-seed.js';
import { fakePdfBytes } from './candidate-fixtures.js';
import type { TestMigrationDeps } from './migration-deps.js';

export const migrationOwner = userActor({ id: 'user_owner', organizationId: ORG_A, role: 'owner' });
export const migrationAdmin = userActor({ id: 'user_admin', organizationId: ORG_A, role: 'admin' });
export const migrationRecruiter = userActor({ id: 'user_rec', organizationId: ORG_A, role: 'recruiter' });

/** The bytes of a ZIP local file header: enough for the upload check, the fake reader does the rest. */
export const zipBytes = (): Uint8Array => new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

/** Two jobs, three people (one already known by email, one with an expired retention), CVs and a stray file. */
export const SAMPLE_PACKAGE: MigrationPackageInput = {
  format: 'candydati-migration',
  version: 1,
  source: { system: 'teamtailor', exportedAt: '2026-05-01T10:00:00Z', producer: 'connector:teamtailor@1' },
  jobs: [
    {
      ref: 'j1',
      title: 'Backend Developer',
      status: 'closed',
      createdAt: '2025-01-10T09:00:00Z',
      closedAt: '2026-03-01T09:00:00Z',
      stages: [
        { ref: 's1', name: 'Colloquio HR', type: 'hr_interview' },
        { ref: 's2', name: 'Applied' },
      ],
    },
    { ref: 'j2', title: 'Designer', status: 'open', createdAt: '2026-01-10T09:00:00Z', stages: [{ ref: 's1', name: 'Colloquio tecnico' }] },
  ],
  candidates: [
    { ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', email: 'ADA@example.com', createdAt: '2026-01-12T09:00:00Z', consent: { givenAt: '2026-01-12T09:00:00Z' } },
    { ref: 'c2', firstName: 'Bruno', lastName: 'Verdi', email: 'bruno@example.com', createdAt: '2020-01-12T09:00:00Z', consent: { givenAt: '2020-01-12T09:00:00Z' } },
    { ref: 'c3', firstName: 'Carla', lastName: 'Neri', email: 'carla@example.com', createdAt: '2026-01-12T09:00:00Z' },
  ],
  applications: [
    { ref: 'a1', candidateRef: 'c1', jobRef: 'j1', stageRef: 's1', createdAt: '2026-01-12T09:00:00Z', outcome: 'hired', closedAt: '2026-02-01T09:00:00Z', files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }] },
    { ref: 'a2', candidateRef: 'c2', jobRef: 'j1', stageRef: 's2', createdAt: '2020-01-12T09:00:00Z' },
    { ref: 'a3', candidateRef: 'c3', jobRef: 'j2', stageRef: 's1', createdAt: '2026-01-12T09:00:00Z', files: [{ path: 'files/a3/cv.txt', kind: 'cv', fileName: 'cv.txt' }] },
  ],
};

/** What the archive reader would hand over for `input`, with these files in it. */
export function openedPackage(input: MigrationPackageInput, files: Readonly<Record<string, Uint8Array>>, unreferenced: readonly string[] = []): MigrationPackageOpenResult {
  const parsed = parseMigrationPackage(input);
  if (!parsed.success) throw new Error(`invalid test package: ${JSON.stringify(parsed.error.issues)}`);
  const entries = Object.entries(files).map(([path, bytes]): [string, MigrationPackageEntry] => [path, { size: bytes.byteLength, read: async () => bytes }]);
  return { ok: true, package: { manifest: parsed.data, files: new Map(entries), unreferenced } };
}

export const SAMPLE_FILES = (): Record<string, Uint8Array> => ({ 'files/a1/cv.pdf': fakePdfBytes(), 'files/a3/cv.txt': new TextEncoder().encode('plain text') });

/** Uploads a package as the owner, registers what the reader will find in it, and runs the analysis like the worker. */
export async function analyzedMigration(
  deps: TestMigrationDeps,
  result: MigrationPackageOpenResult = openedPackage(SAMPLE_PACKAGE, SAMPLE_FILES(), ['files/extra.pdf']),
): Promise<MigrationBatch> {
  const created = await createMigrationFromPackage(deps, migrationOwner, { file: { fileName: 'export.zip', bytes: zipBytes() } });
  deps.packages.register(migrationPackageKey(ORG_A, created.id), result);
  await analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id });
  const batch = await deps.migrations.findById(ORG_A, created.id);
  if (!batch) throw new Error('batch vanished');
  return batch;
}
