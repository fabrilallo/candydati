import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_APPLICATION_MAX_BYTES, applicationFilePrefix, type MigrationPackageInput } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ORG_A, seedMigrationCommitWorld, type TestMigrationCommitDeps } from '../../testing/index.js';
import { ADA_ANSWERS, ATTACHMENTS_FILES, ATTACHMENTS_PACKAGE, COMMIT_FILES, COMMIT_PACKAGE, confirmedMigration } from '../../testing/migration-commit-fixtures.js';
import { migrationOwner, openedPackage } from '../../testing/migration-fixtures.js';
import { eraseCandidateData } from '../privacy/erase-candidate-data.js';
import { commitMigration } from './commit-migration.js';
import { undoMigration } from './undo-migration.js';

const run = (deps: TestMigrationCommitDeps, batchId: string) => commitMigration(deps, { organizationId: ORG_A, batchId });

async function committed(manifest: MigrationPackageInput = ATTACHMENTS_PACKAGE, files: Record<string, Uint8Array> = ATTACHMENTS_FILES()) {
  const deps = seedMigrationCommitWorld();
  const batch = await confirmedMigration(deps, openedPackage(manifest, files));
  expect(await run(deps, batch.id)).toBe('done');
  const ada = deps.store.read().applications.find((a) => a.migrationBatchId === batch.id && a.candidateId === 'cand_1');
  if (!ada) throw new Error('Ada was not migrated');
  return { deps, batch, ada };
}

const attachmentsOf = (deps: TestMigrationCommitDeps, applicationId: string) => deps.store.read().attachments.filter((f) => f.applicationId === applicationId);
const filesUnder = (deps: TestMigrationCommitDeps, applicationId: string) => deps.files.keys().filter((key) => key.startsWith(applicationFilePrefix(ORG_A, applicationId)));

describe('commitMigration: attachments and form answers', () => {
  it('stores every allowed file besides the CV under the application prefix, with its sniffed type and kind', async () => {
    const { deps, batch, ada } = await committed();
    const attachments = attachmentsOf(deps, ada.id);
    expect(attachments.map((f) => [f.kind, f.fileName, f.mediaType, f.migrationBatchId])).toEqual([
      ['cover_letter', 'Lettera di presentazione.pdf', 'application/pdf', batch.id],
      ['other', 'certificato.png', 'image/png', batch.id],
    ]);
    for (const attachment of attachments) {
      expect(attachment.key).toBe(`${applicationFilePrefix(ORG_A, ada.id)}attachments/${attachment.id}`);
      expect(deps.files.keys()).toContain(attachment.key);
    }
    expect(ada.cv?.fileName).toBe('ada-cv.pdf');
    expect(filesUnder(deps, ada.id).toSorted()).toEqual([ada.cv?.key, ...attachments.map((f) => f.key)].toSorted());
  });

  it('never stores a forbidden or missing file, and counts what it skipped by reason', async () => {
    const { deps, batch } = await committed();
    const stored = await Promise.all(deps.files.keys().map((key) => deps.files.get(key)));
    expect(stored.some((bytes) => bytes[0] === 0x4d && bytes[1] === 0x5a)).toBe(false);
    const counts = (await deps.migrations.findById(ORG_A, batch.id))?.counts.commit;
    expect(counts).toMatchObject({ cvs: 1, attachments: 4, filesSkipped: 2, filesSkippedType: 1, filesSkippedSize: 0, filesSkippedMissing: 1, answers: 1 });
  });

  it('keeps the form answers on the application, and none on applications that had none', async () => {
    const { deps, batch, ada } = await committed();
    expect(ada.answers).toEqual(ADA_ANSWERS);
    const others = deps.store.read().applications.filter((a) => a.migrationBatchId === batch.id && a.id !== ada.id);
    expect(others.every((a) => a.answers === null)).toBe(true);
  });

  it('skips a file over the size cap, and the files past the per-application cap', async () => {
    const big = (size: number) => new Uint8Array(size).fill(0x61);
    const files = Array.from({ length: 6 }, (_, i) => ({ path: `files/a1/doc${i}.txt`, kind: 'other' as const, fileName: `doc${i}.txt` }));
    const manifest: MigrationPackageInput = {
      ...COMMIT_PACKAGE,
      applications: COMMIT_PACKAGE.applications.map((a) => (a.ref === 'a1' ? { ...a, files: [...(a.files ?? []), ...files, { path: 'files/a1/huge.txt', kind: 'other', fileName: 'huge.txt' }] } : a)),
    };
    const perFile = ATTACHMENTS_PER_APPLICATION_MAX_BYTES / 5;
    expect(perFile).toBeLessThanOrEqual(ATTACHMENT_MAX_BYTES);
    const contents = { ...COMMIT_FILES(), ...Object.fromEntries(files.map((f) => [f.path, big(perFile)])), 'files/a1/huge.txt': big(ATTACHMENT_MAX_BYTES + 1) };
    const { deps, batch, ada } = await committed(manifest, contents);
    expect(attachmentsOf(deps, ada.id)).toHaveLength(5);
    expect((await deps.migrations.findById(ORG_A, batch.id))?.counts.commit).toMatchObject({ filesSkippedSize: 2 });
  });

  it('removes the copied files when the chunk transaction fails, and the retry ends with the same ids and keys', async () => {
    const deps = seedMigrationCommitWorld();
    const batch = await confirmedMigration(deps, openedPackage(ATTACHMENTS_PACKAGE, ATTACHMENTS_FILES()));
    const insertAttachments = deps.migratedRows.insertAttachments;
    const broken = { ...deps, migratedRows: { ...deps.migratedRows, insertAttachments: async () => Promise.reject(new Error('crash')) } };
    await expect(run(broken, batch.id)).rejects.toThrow('crash');
    expect(deps.files.keys().filter((key) => key.includes('/applications/'))).toEqual([]);
    expect(deps.store.read().attachments).toEqual([]);
    expect(await run({ ...deps, migratedRows: { ...deps.migratedRows, insertAttachments } }, batch.id)).toBe('done');
    const clean = await committed();
    expect(deps.store.read().attachments.map((f) => f.id).toSorted()).toEqual(clean.deps.store.read().attachments.map((f) => f.id).toSorted());
  });
});

describe('attachments go with their application', () => {
  it('erasure deletes the attachment rows and files, the answers with the row', async () => {
    const { deps, ada } = await committed();
    await eraseCandidateData(deps, { organizationId: ORG_A, candidateId: 'cand_1', reason: 'request', actor: { type: 'user', id: 'user_owner' } });
    expect(deps.store.read().applications.some((a) => a.id === ada.id)).toBe(false);
    expect(attachmentsOf(deps, ada.id)).toEqual([]);
    expect(filesUnder(deps, ada.id)).toEqual([]);
  });

  it('the undo leaves no attachment row nor file of the batch', async () => {
    const { deps, batch, ada } = await committed();
    await undoMigration(deps, migrationOwner, { migrationId: batch.id });
    expect(deps.store.read().attachments).toEqual([]);
    expect(filesUnder(deps, ada.id)).toEqual([]);
    expect(deps.files.keys().filter((key) => key.includes('/attachments/'))).toEqual([]);
  });
});
