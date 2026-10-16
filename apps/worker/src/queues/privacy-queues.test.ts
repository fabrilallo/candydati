import { dataExportKey, emptyImportCounts } from '@candydati/domain';
import { buildApplication, createFakeEmailSender, createInMemoryFileStorage, ORG_A, ORG_B, seedImportWorld, seedPrivacyData, userActor, createInMemoryTransaction } from '@candydati/core/testing';
import { formatDigestFrom } from '@candydati/core';
import { requestOrganizationExport } from '@candydati/core';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createFilesDeleteQueue } from './files-delete.js';
import { createOrganizationExportQueue } from './organization-export.js';
import { createRetentionRunQueue, RETENTION_RUN_CRON } from './retention-run.js';

const logger = pino({ level: 'silent' });
const job = <Payload>(payload: Payload, lastAttempt = true) => ({ jobId: 'j1', payload, logger, lastAttempt, attempt: 1 });
const DAY = 24 * 3600 * 1000;

describe('files.delete', () => {
  const key = `organizations/${ORG_A}/applications/app_1/cv`;

  it('deletes the file', async () => {
    const files = createInMemoryFileStorage();
    await files.put(key, new Uint8Array([1]), 'application/pdf');
    await createFilesDeleteQueue(files).handle(job({ organizationId: ORG_A, key }));
    expect(files.keys()).toEqual([]);
  });

  it('rethrows a storage failure so that pg-boss retries', async () => {
    const files = { ...createInMemoryFileStorage(), delete: () => Promise.reject(new Error('storage down')) };
    await expect(createFilesDeleteQueue(files).handle(job({ organizationId: ORG_A, key }, false))).rejects.toThrow('storage down');
    await expect(createFilesDeleteQueue(files).handle(job({ organizationId: ORG_A, key }, true))).rejects.toThrow('storage down');
  });

  it('refuses a key of another organization or with traversal, and a payload without a key', async () => {
    const files = createInMemoryFileStorage();
    await files.put(`organizations/${ORG_B}/applications/x/cv`, new Uint8Array([1]), 'application/pdf');
    const queue = createFilesDeleteQueue(files);
    await queue.handle(job({ organizationId: ORG_A, key: `organizations/${ORG_B}/applications/x/cv` }));
    await queue.handle(job({ organizationId: ORG_A, key: `organizations/${ORG_A}/../${ORG_B}/applications/x/cv` }));
    expect(files.keys()).toHaveLength(1);
    expect(queue.payload.safeParse({ organizationId: ORG_A }).success).toBe(false);
  });
});

describe('organization.export', () => {
  it('builds the ZIP and marks the request ready', async () => {
    const deps = await seedPrivacyData();
    const created = await requestOrganizationExport(deps, userActor({ role: 'admin', organizationId: ORG_A }), {});
    await createOrganizationExportQueue(deps).handle(job({ organizationId: ORG_A, exportId: created.id }));
    expect(deps.dataExports.snapshot()).toMatchObject([{ status: 'ready' }]);
    expect(deps.files.keys()).toContain(dataExportKey(ORG_A, created.id));
  });

  it('fails the job for an unknown export', async () => {
    const deps = await seedPrivacyData();
    await expect(createOrganizationExportQueue(deps).handle(job({ organizationId: ORG_A, exportId: 'nope' }))).rejects.toThrow();
  });
});

describe('retention.run: abandoned imports', () => {
  it('purges the files and rows of a batch never committed after the configured days, and logs only ids', async () => {
    const NOW = new Date('2027-06-01T03:00:00Z');
    const key = `organizations/${ORG_A}/imports/b1/people.zip`;
    const batch = { id: 'b1', organizationId: ORG_A, jobId: 'job_1', stageId: 'received', status: 'ready' as const, createdBy: 'u1', counts: emptyImportCounts(), mapping: null, headers: [], sourceFiles: [{ key, fileName: 'people.zip', sizeBytes: 1 }], error: null, createdAt: new Date(NOW.getTime() - 8 * DAY), importedAt: null, undoneAt: null };
    const imports = seedImportWorld({ batches: [batch] });
    await imports.files.put(key, new Uint8Array([1]), 'application/zip');
    const retention = await seedPrivacyData();
    const queue = createRetentionRunQueue({
      retention,
      imports,
      importStaleDays: 7,
      digest: { transaction: createInMemoryTransaction(), mail: { sender: createFakeEmailSender(), from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example', locale: 'en' } },
      now: () => NOW,
    });
    await queue.handle(job({}));
    expect(imports.files.keys()).toEqual([]);
    expect(await imports.imports.findById(ORG_A, 'b1')).toMatchObject({ status: 'failed', error: 'expired', sourceFiles: [] });
  });
});

describe('retention.run', () => {
  const NOW = new Date('2027-06-01T03:00:00Z');

  it('is scheduled daily at 03:00, erases the expired, warns about the expiring and emails the digest without names', async () => {
    const deps = await seedPrivacyData({
      applications: [
        buildApplication({ id: 'app_old', organizationId: ORG_A, candidateId: 'cand_1', retentionExpiresAt: new Date(NOW.getTime() - DAY), cv: { key: `organizations/${ORG_A}/applications/app_old/cv`, fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 1 } }),
        buildApplication({ id: 'app_soon', organizationId: ORG_A, candidateId: 'cand_2', retentionExpiresAt: new Date(NOW.getTime() + 10 * DAY) }),
      ],
    });
    const sender = createFakeEmailSender();
    const queue = createRetentionRunQueue({
      retention: deps,
      imports: seedImportWorld(),
      importStaleDays: 7,
      digest: { transaction: createInMemoryTransaction(), mail: { sender, from: formatDigestFrom('Platform', 'noreply@mail.example'), platformUrl: 'https://app.example', locale: 'en' } },
      now: () => NOW,
    });
    expect(queue.schedule).toEqual({ cron: '0 3 * * *', data: {} });
    expect(RETENTION_RUN_CRON).toBe('0 3 * * *');
    await queue.handle(job({}));
    expect(deps.store.read().applications.map((a) => a.id)).toEqual(['app_soon']);
    expect(deps.notifications.snapshot().filter((n) => n.kind === 'retention_expiring')).not.toHaveLength(0);
    expect(sender.sent().length).toBeGreaterThan(0);
    expect(sender.sent()[0]?.text).toContain('data retention expiring');
    expect(JSON.stringify(sender.sent())).not.toMatch(/Zelda|Bruno/i);
  });
});
