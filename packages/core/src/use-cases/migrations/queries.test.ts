import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { ORG_A, seedMigrationWorld, userActor } from '../../testing/index.js';
import { analyzedMigration, migrationAdmin, migrationOwner, migrationRecruiter, zipBytes } from '../../testing/migration-fixtures.js';
import { createMigrationFromPackage } from './create-migration.js';
import { getMigration, listMigrationIssues, listMigrations, updateMigrationChoices } from './queries.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const outsider = userActor({ id: 'user_b', organizationId: 'org_b', role: 'owner' });

describe('getMigration and listMigrations', () => {
  it('returns the batch to owner and admin, newest first, never across organizations, without auditing', async () => {
    const deps = seedMigrationWorld();
    const ready = await analyzedMigration(deps);
    expect(await getMigration(deps, migrationAdmin, { migrationId: ready.id })).toEqual(ready);
    expect((await listMigrations(deps, migrationOwner, {})).map((b) => b.id)).toEqual([ready.id]);
    expect(await listMigrations(deps, outsider, {})).toEqual([]);
    expect(await rejection(getMigration(deps, outsider, { migrationId: ready.id }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(getMigration(deps, migrationRecruiter, { migrationId: ready.id }))).toBeInstanceOf(ForbiddenError);
    expect(deps.auditLog.events().map((e) => e.action)).toEqual(['migration.created']);
  });
});

describe('listMigrationIssues', () => {
  it('pages the issues, errors first, and filters by level', async () => {
    const deps = seedMigrationWorld();
    const ready = await analyzedMigration(deps);
    const first = await listMigrationIssues(deps, migrationOwner, { migrationId: ready.id, limit: 2 });
    expect(first).toMatchObject({ total: 6, page: 1, limit: 2 });
    expect(first.items.map((i) => i.code)).toEqual(['consent_expired', 'file_not_cv']);
    const second = await listMigrationIssues(deps, migrationOwner, { migrationId: ready.id, page: 2, limit: 2 });
    expect(second.items.map((i) => i.code)).toEqual(['consent_to_renew', 'file_unreferenced']);
    expect((await listMigrationIssues(deps, migrationOwner, { migrationId: ready.id, level: 'warning' })).total).toBe(2);
    expect(await rejection(listMigrationIssues(deps, migrationOwner, { migrationId: ready.id, limit: 1000 }))).toBeInstanceOf(ValidationError);
    expect(await rejection(listMigrationIssues(deps, outsider, { migrationId: ready.id }))).toBeInstanceOf(NotFoundError);
  });
});

describe('updateMigrationChoices', () => {
  it('changes the stage mapping of known stages and the excluded jobs', async () => {
    const deps = seedMigrationWorld();
    const ready = await analyzedMigration(deps);
    const updated = await updateMigrationChoices(deps, migrationOwner, {
      migrationId: ready.id,
      stageMapping: [{ jobRef: 'j1', stageRef: 's2', type: 'screening_call', title: 'Candidatura ricevuta' }],
      excludedJobs: ['j2'],
    });
    expect(updated.stageMapping).toEqual([
      { jobRef: 'j1', stageRef: 's1', type: 'hr_interview', title: 'Colloquio HR' },
      { jobRef: 'j1', stageRef: 's2', type: 'screening_call', title: 'Candidatura ricevuta' },
      { jobRef: 'j2', stageRef: 's1', type: 'technical_interview', title: 'Colloquio tecnico' },
    ]);
    expect(updated.excludedJobs).toEqual(['j2']);
    expect(updated.updatedAt).toEqual(deps.now());
    const again = await updateMigrationChoices(deps, migrationOwner, { migrationId: ready.id, excludedJobs: [] });
    expect(again).toMatchObject({ excludedJobs: [], stageMapping: updated.stageMapping });
  });

  it('refuses unknown stages and jobs, and never lets people whose retention expired back in', async () => {
    const deps = seedMigrationWorld();
    const ready = await analyzedMigration(deps);
    const refused = async (input: Record<string, unknown>) => rejection(updateMigrationChoices(deps, migrationOwner, { migrationId: ready.id, ...input }));
    expect(await refused({ stageMapping: [{ jobRef: 'j1', stageRef: 'nope', type: 'offer', title: 'X' }] })).toBeInstanceOf(ValidationError);
    expect(await refused({ stageMapping: [{ jobRef: 'j1', stageRef: 's1', type: 'ranking', title: 'X' }] })).toBeInstanceOf(ValidationError);
    expect(await refused({ excludedJobs: ['j9'] })).toBeInstanceOf(ValidationError);
    expect(await refused({ includeExpired: true })).toBeInstanceOf(ValidationError);
    expect(await refused({ includeExpired: false })).not.toBeInstanceOf(Error);
  });

  it('only edits a ready batch, only for owner and admin', async () => {
    const deps = seedMigrationWorld();
    const created = await createMigrationFromPackage(deps, migrationOwner, { file: { fileName: 'export.zip', bytes: zipBytes() } });
    expect(await rejection(updateMigrationChoices(deps, migrationOwner, { migrationId: created.id, excludedJobs: [] }))).toBeInstanceOf(ConflictError);
    expect(await rejection(updateMigrationChoices(deps, migrationRecruiter, { migrationId: created.id, excludedJobs: [] }))).toBeInstanceOf(ForbiddenError);
    expect((await deps.migrations.findById(ORG_A, created.id))?.status).toBe('uploaded');
  });
});
