import { migrationPackageKey } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ORG_A, seedMigrationWorld } from '../../testing/index.js';
import { analyzedMigration, migrationOwner, openedPackage, SAMPLE_FILES, SAMPLE_PACKAGE, zipBytes } from '../../testing/migration-fixtures.js';
import { analyzeMigration } from './analyze-migration.js';
import { createMigrationFromPackage } from './create-migration.js';

const issuesOf = async (deps: ReturnType<typeof seedMigrationWorld>, batchId: string) =>
  (await deps.migrationIssues.list({ organizationId: ORG_A, batchId, page: 1, limit: 100 })).items.map((i) => `${i.level}:${i.code}:${i.ref ?? ''}`);

async function uploaded(deps: ReturnType<typeof seedMigrationWorld>) {
  return createMigrationFromPackage(deps, migrationOwner, { file: { fileName: 'export.zip', bytes: zipBytes() } });
}

describe('analyzeMigration', () => {
  it('opens the package, stores counts, the stage mapping and the issues, and leaves the batch ready', async () => {
    const deps = seedMigrationWorld();
    const batch = await analyzedMigration(deps);
    expect(batch).toMatchObject({ status: 'ready', sourceSystem: 'teamtailor', producer: 'connector:teamtailor@1', error: null, excludedJobs: [] });
    expect(batch.counts).toMatchObject({ jobs: 2, candidates: 2, applications: 2, merged: 1, consentGiven: 1, consentToRenew: 1, consentExpired: 1, excludedApplications: 1 });
    expect(batch.stageMapping.map((entry) => entry.type)).toEqual(['hr_interview', 'other', 'technical_interview']);
    expect(await issuesOf(deps, batch.id)).toEqual([
      'warning:consent_expired:c2',
      'warning:file_not_cv:files/a3/cv.txt',
      'info:consent_to_renew:',
      'info:file_unreferenced:files/extra.pdf',
      'info:merge_existing:c1',
      'info:stage_unmapped:j1/s2',
    ]);
  });

  it('does not sniff files too large to be a CV, and reports them', async () => {
    const deps = seedMigrationWorld();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    let reads = 0;
    const result = openedPackage(SAMPLE_PACKAGE, { ...SAMPLE_FILES(), 'files/a1/cv.pdf': big });
    if (!result.ok) throw new Error('unexpected');
    const counting = new Map([...result.package.files].map(([path, entry]) => [path, { size: entry.size, read: async () => { reads += 1; return entry.read(); } }]));
    const batch = await analyzedMigration(deps, { ok: true, package: { ...result.package, files: counting } });
    expect(await issuesOf(deps, batch.id)).toContain('warning:file_too_large:files/a1/cv.pdf');
    expect(reads).toBe(1);
  });

  it('flags the missing privacy notice as an error', async () => {
    const deps = seedMigrationWorld({ overrides: { privacyNotices: { async findActive() { return null; }, async create(n) { return n; }, async list() { return []; } } } });
    const batch = await analyzedMigration(deps);
    expect(batch.counts.issueErrors).toBe(1);
    expect((await issuesOf(deps, batch.id))[0]).toBe('error:privacy_notice_missing:');
  });

  it('fails the batch with the reader code when the package is refused, and drops the stored package', async () => {
    const deps = seedMigrationWorld();
    const created = await uploaded(deps);
    deps.packages.register(created.packageKey, { ok: false, code: 'invalid_manifest', details: ['jobs.0.title: too_small'] });
    expect(await analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id })).toBe('failed');
    expect(await deps.migrations.findById(ORG_A, created.id)).toMatchObject({ status: 'failed', error: 'invalid_manifest' });
    expect(deps.files.keys()).toEqual([]);
  });

  it('lets the queue retry an unexpected error, and fails the batch on the last attempt', async () => {
    const deps = seedMigrationWorld();
    const created = await uploaded(deps);
    deps.packages.register(created.packageKey, new Error('storage down'));
    await expect(analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id })).rejects.toThrow('storage down');
    expect((await deps.migrations.findById(ORG_A, created.id))?.status).toBe('analyzing');
    expect(await analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id, lastAttempt: true })).toBe('failed');
    expect(await deps.migrations.findById(ORG_A, created.id)).toMatchObject({ status: 'failed', error: 'analysis_failed' });
  });

  it('runs again from analyzing after a crash, and skips a batch that is past the analysis or missing', async () => {
    const deps = seedMigrationWorld();
    const created = await uploaded(deps);
    deps.packages.register(migrationPackageKey(ORG_A, created.id), new Error('crash'));
    await expect(analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id })).rejects.toThrow('crash');
    deps.packages.register(created.packageKey, openedPackage(SAMPLE_PACKAGE, SAMPLE_FILES()));
    expect(await analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id })).toBe('ready');
    expect(await analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id })).toBe('skipped');
    expect(await analyzeMigration(deps, { organizationId: 'org_b', batchId: created.id })).toBe('skipped');
  });

  it('looks existing people up by email in chunks', async () => {
    const deps = seedMigrationWorld();
    const asked: number[] = [];
    const counting = { ...deps, candidates: { ...deps.candidates, findByEmails: async (org: string, emails: readonly string[]) => { asked.push(emails.length); return deps.candidates.findByEmails(org, emails); } } };
    const many = Array.from({ length: 1500 }, (_, index) => ({ ref: `p${index}`, firstName: 'Ada', lastName: 'Rossi', email: `p${index}@example.com`, createdAt: '2026-01-12T09:00:00Z' }));
    await analyzedMigration(counting, openedPackage({ ...SAMPLE_PACKAGE, candidates: [...SAMPLE_PACKAGE.candidates, ...many] }, SAMPLE_FILES()));
    expect(asked).toEqual([1000, 503]);
  });
});
