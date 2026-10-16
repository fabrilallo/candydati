import type { MigrationBatch, MigrationIssue } from '@candydati/domain';
import type { MigrationCommitDeps, MigrationUndoDeps } from '../migration-commit-ports.js';
import type { MigrationAnalysisDeps } from '../migration-ports.js';
import { seedImportWorld, type ImportSeedOptions, type TestImportDeps } from './import-deps.js';
import type { InMemoryJobRepository } from './in-memory-jobs.js';
import { createInMemoryMigratedRows } from './in-memory-migrated-rows.js';
import { seedCandidateWorld, type SeedOptions } from './candidate-seed.js';
import type { TestCandidateDeps } from './candidate-deps.js';
import {
  createFakeMigrationPackageReader,
  createInMemoryMigrationBatches,
  createInMemoryMigrationIssues,
  createMigrationStore,
  type FakeMigrationPackageReader,
  type MigrationStore,
} from './in-memory-migrations.js';

export type TestMigrationDeps = TestCandidateDeps &
  MigrationAnalysisDeps & {
    readonly migrationStore: MigrationStore;
    readonly packages: FakeMigrationPackageReader;
  };

export interface MigrationSeedOptions extends SeedOptions {
  readonly batches?: readonly MigrationBatch[];
  readonly issues?: readonly MigrationIssue[];
  readonly migrationOverrides?: Partial<TestMigrationDeps>;
}

/** The candidate world (`org_a` with notice v1 and one candidate) plus migration batches, issues and a fake package reader. */
export function seedMigrationWorld(options: MigrationSeedOptions = {}): TestMigrationDeps {
  const world = seedCandidateWorld(options);
  const migrationStore = createMigrationStore({ batches: options.batches ?? [], issues: options.issues ?? [] });
  return {
    ...world,
    migrationStore,
    migrations: createInMemoryMigrationBatches(migrationStore),
    migrationIssues: createInMemoryMigrationIssues(migrationStore),
    packages: createFakeMigrationPackageReader(),
    ...options.migrationOverrides,
  };
}

export type TestMigrationCommitDeps = TestImportDeps &
  MigrationAnalysisDeps &
  MigrationCommitDeps &
  MigrationUndoDeps & {
    readonly migrationStore: MigrationStore;
    readonly packages: FakeMigrationPackageReader;
  };

export interface MigrationCommitSeedOptions extends ImportSeedOptions {
  readonly migrationOverrides?: Partial<TestMigrationCommitDeps>;
}

/**
 * The import world (`org_a` with notice v1, job `job_1`, one candidate, members, erasure, consent tokens and the
 * reconfirmation path) plus the migration store, the migrated rows and a fake package reader: what commit and undo need.
 */
export function seedMigrationCommitWorld(options: MigrationCommitSeedOptions = {}): TestMigrationCommitDeps {
  const world = seedImportWorld(options);
  const migrationStore = createMigrationStore();
  if (!('remove' in world.jobs)) throw new Error('the migration world needs the in-memory job repository');
  const jobs = world.jobs as InMemoryJobRepository;
  return {
    ...world,
    migrationStore,
    migrations: createInMemoryMigrationBatches(migrationStore),
    migrationIssues: createInMemoryMigrationIssues(migrationStore),
    migratedRows: createInMemoryMigratedRows({ store: world.store, messagingStore: world.messagingStore, jobs, migrationStore }),
    packages: createFakeMigrationPackageReader(),
    ...options.migrationOverrides,
  };
}
