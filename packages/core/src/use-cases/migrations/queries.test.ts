import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { seedMigrationWorld, userActor } from '../../testing/index.js';
import { analyzedMigration, migrationAdmin, migrationOwner, migrationRecruiter } from '../../testing/migration-fixtures.js';
import { getMigration, listMigrationIssues, listMigrations } from './queries.js';

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
