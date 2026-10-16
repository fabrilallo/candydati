import type { MigrationBatch, MigrationIssue } from '@candydati/domain';
import type { MigrationAnalysisDeps } from '../migration-ports.js';
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
