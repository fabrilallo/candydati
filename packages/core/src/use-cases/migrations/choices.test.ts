import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { ORG_A, seedMigrationWorld } from '../../testing/index.js';
import { analyzedMigration, migrationOwner, migrationRecruiter, zipBytes } from '../../testing/migration-fixtures.js';
import { updateMigrationChoices } from './choices.js';
import { createMigrationFromPackage } from './create-migration.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

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
      { jobRef: 'j1', stageRef: 's1', sourceName: 'Colloquio HR', type: 'hr_interview', title: 'Colloquio HR' },
      { jobRef: 'j1', stageRef: 's2', sourceName: 'Applied', type: 'screening_call', title: 'Candidatura ricevuta' },
      { jobRef: 'j2', stageRef: 's1', sourceName: 'Colloquio tecnico', type: 'technical_interview', title: 'Colloquio tecnico' },
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

describe('updateMigrationChoices: merged and bulk stages', () => {
  it('maps every stage with one source name across jobs in one call, and lets a single-stage choice win', async () => {
    const deps = seedMigrationWorld();
    const ready = await analyzedMigration(deps);
    const updated = await updateMigrationChoices(deps, migrationOwner, {
      migrationId: ready.id,
      stageNames: [{ name: 'colloquio-hr', type: 'hr_interview', title: 'Colloquio' }, { name: 'APPLIED', type: 'received' }],
      stageMapping: [{ jobRef: 'j2', stageRef: 's1', type: 'hr_interview', title: 'Colloquio' }],
    });
    expect(updated.stageMapping.map((e) => `${e.jobRef}/${e.stageRef}:${e.type}:${e.title}`)).toEqual([
      'j1/s1:hr_interview:Colloquio',
      'j1/s2:received:APPLIED',
      'j2/s1:hr_interview:Colloquio',
    ]);
  });

  it('refuses a source name the package does not have, and changes nothing', async () => {
    const deps = seedMigrationWorld();
    const ready = await analyzedMigration(deps);
    const error = await rejection(updateMigrationChoices(deps, migrationOwner, { migrationId: ready.id, stageNames: [{ name: 'Ghost', type: 'offer' }] }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([{ path: 'stageNames', message: 'unknown_stage_name: Ghost' }]);
    expect((await deps.migrations.findById(ORG_A, ready.id))?.stageMapping).toEqual(ready.stageMapping);
  });
});
