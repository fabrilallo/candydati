import { createHash } from 'node:crypto';
import type { ImportBatch } from '@tt/domain';
import type { ConsentDeps, ImportCommitDeps, ImportDeps, ImportUndoDeps } from '../import-ports.js';
import { createInMemoryErasure } from './in-memory-privacy-ops.js';
import {
  createImportStore,
  createInMemoryConsentTokens,
  createInMemoryImportAnalyses,
  createInMemoryImportBatches,
  createInMemoryImportCommit,
  createInMemoryImportItems,
  type ImportStore,
} from './in-memory-imports.js';
import { seedPrivacyWorld, type PrivacySeedOptions, type TestPrivacyDeps } from './privacy-deps.js';
import { ORG_A } from './candidate-seed.js';

export type TestImportDeps = TestPrivacyDeps &
  ImportDeps &
  ImportCommitDeps &
  ImportUndoDeps &
  ConsentDeps & {
    readonly importStore: ImportStore;
    readonly mailErrors: unknown[];
  };

export interface ImportSeedOptions extends PrivacySeedOptions {
  readonly batches?: readonly ImportBatch[];
  readonly importOverrides?: Partial<TestImportDeps>;
}

/** The privacy world (`org_a`, job `job_1`) plus the import ports in memory, a counter-based secret generator and sha256. */
export function seedImportWorld(options: ImportSeedOptions = {}): TestImportDeps {
  const world = seedPrivacyWorld(options);
  const importStore = createImportStore({ batches: options.batches ?? [] });
  let secrets = 0;
  const mailErrors: unknown[] = [];
  const erasure = createInMemoryErasure({ ...world, importStore });
  return {
    ...world,
    erasure,
    importStore,
    imports: createInMemoryImportBatches(importStore),
    importItems: createInMemoryImportItems(importStore),
    importAnalyses: createInMemoryImportAnalyses(importStore),
    consentTokens: createInMemoryConsentTokens(importStore),
    commit: createInMemoryImportCommit(world.store, importStore, world.jobs),
    mail: world,
    newSecret: () => {
      secrets += 1;
      return `consent-secret-${String(secrets).padStart(6, '0')}-abcdefgh`;
    },
    hash: (secret) => createHash('sha256').update(secret).digest('hex'),
    onMailError: (error) => mailErrors.push(error),
    mailErrors,
    ...options.importOverrides,
  } as TestImportDeps;
}

export const IMPORT_ORG = ORG_A;
