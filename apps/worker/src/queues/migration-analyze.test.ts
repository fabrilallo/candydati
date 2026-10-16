import { createMigrationFromPackage } from '@candydati/core';
import { ORG_A, seedMigrationWorld, userActor } from '@candydati/core/testing';
import { parseMigrationPackage } from '@candydati/domain';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createMigrationAnalyzeQueue, migrationPayload } from './migration-analyze.js';

const logger = pino({ level: 'silent' });
const owner = userActor({ id: 'user_owner', organizationId: ORG_A, role: 'owner' });
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]);
const manifest = parseMigrationPackage({
  format: 'candydati-migration',
  version: 1,
  source: { system: 'recruitee', exportedAt: '2026-10-01T10:00:00Z', producer: 'test' },
  jobs: [{ ref: 'j1', title: 'Backend Developer', status: 'closed', createdAt: '2025-01-10T09:00:00Z', closedAt: '2025-03-01T09:00:00Z', stages: [{ ref: 's1', name: 'Colloquio HR' }] }],
  candidates: [{ ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', email: 'ada.b@example.com', createdAt: '2025-01-12T09:00:00Z' }],
  applications: [{ ref: 'a1', candidateRef: 'c1', jobRef: 'j1', stageRef: 's1', createdAt: '2025-01-12T09:00:00Z' }],
});

describe('migration.analyze', () => {
  it('validates the payload: ids only', () => {
    expect(migrationPayload.safeParse({ organizationId: 'o', batchId: 'b' }).success).toBe(true);
    expect(migrationPayload.safeParse({ organizationId: 'o' }).success).toBe(false);
  });

  it('leaves the batch ready, and fails it with the reader code when the package is refused', async () => {
    if (!manifest.success) throw new Error('bad manifest');
    const deps = seedMigrationWorld();
    const queue = createMigrationAnalyzeQueue(deps);
    const good = await createMigrationFromPackage(deps, owner, { file: { fileName: 'a.zip', bytes: zip } });
    deps.packages.register(good.packageKey, { ok: true, package: { manifest: manifest.data, files: new Map(), unreferenced: [] } });
    await queue.handle({ jobId: 'j1', payload: { organizationId: ORG_A, batchId: good.id }, logger, lastAttempt: false, attempt: 1 });
    expect(await deps.migrations.findById(ORG_A, good.id)).toMatchObject({ status: 'ready', sourceSystem: 'recruitee', counts: { jobs: 1 } });
    const bad = await createMigrationFromPackage(deps, owner, { file: { fileName: 'b.zip', bytes: zip } });
    deps.packages.register(bad.packageKey, { ok: false, code: 'missing_manifest', details: [] });
    await queue.handle({ jobId: 'j2', payload: { organizationId: ORG_A, batchId: bad.id }, logger, lastAttempt: false, attempt: 1 });
    expect(await deps.migrations.findById(ORG_A, bad.id)).toMatchObject({ status: 'failed', error: 'missing_manifest' });
  });

  it('rethrows an unexpected error for a retry, and fails the batch on the last attempt', async () => {
    const deps = seedMigrationWorld();
    const queue = createMigrationAnalyzeQueue(deps);
    const batch = await createMigrationFromPackage(deps, owner, { file: { fileName: 'a.zip', bytes: zip } });
    deps.packages.register(batch.packageKey, new Error('storage down'));
    const payload = { organizationId: ORG_A, batchId: batch.id };
    await expect(queue.handle({ jobId: 'j', payload, logger, lastAttempt: false, attempt: 1 })).rejects.toThrow('storage down');
    await queue.handle({ jobId: 'j', payload, logger, lastAttempt: true, attempt: 4 });
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: 'analysis_failed' });
  });
});
