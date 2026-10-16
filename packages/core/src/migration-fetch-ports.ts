import type { MigrationConnectorField, MigrationConnectorInput, MigrationConnectorMaturity, MigrationFetchError } from '@candydati/domain';
import type { z } from 'zod';
import type { MigrationDeps } from './migration-ports.js';

/**
 * A built-in source connector as core sees it (ADR 0009, Phase 6): what to list, the schema its credentials must meet,
 * and nothing about how it talks to the vendor. `@candydati/providers` implements the connectors and their registry.
 */
export interface MigrationSource {
  readonly id: string;
  /** The vendor product name. */
  readonly label: string;
  readonly maturity: MigrationConnectorMaturity;
  readonly input: MigrationConnectorInput;
  /** The public documentation the connector is built on. */
  readonly docsUrl: string;
  /** How the web draws the credentials form. */
  readonly fields: readonly MigrationConnectorField[];
  /** Checked when the migration is created and again, after decryption, when the fetch starts. */
  readonly credentials: z.ZodType;
}

export interface MigrationSourceCatalog {
  list(): readonly MigrationSource[];
  find(id: string): MigrationSource | undefined;
}

/**
 * Authenticated encryption of the connector credentials while the fetch runs (key derived from `BETTER_AUTH_SECRET`).
 * `context` binds a ciphertext to one batch: it cannot be replayed on another.
 * @throws on a tampered, foreign or malformed envelope.
 */
export interface CredentialsBox {
  seal(plaintext: string, context: string): string;
  open(envelope: string, context: string): string;
}

/** What one part of a fetch holds, for the batch counts and the audit log. No personal data. */
export interface MigrationPartCounts {
  readonly jobs: number;
  readonly candidates: number;
  readonly applications: number;
  readonly notes: number;
  readonly messages: number;
  readonly files: number;
  readonly bytes: number;
}

export interface MigrationFetchRequest {
  readonly organizationId: string;
  readonly batchId: string;
  readonly connectorId: string;
  /** Already checked against the connector's schema. */
  readonly credentials: unknown;
  /** `organizations/{org}/migrations/{batchId}/`: temporary files of the fetch go under it. */
  readonly filePrefix: string;
  /** Storage key of the package of part `index` (0-based). Called once per part, in order. */
  partKey(index: number): string;
  /** Records how far the fetch is; also keeps the batch alive for the reconciler. */
  progress(done: number, total: number | null): Promise<void>;
  /** Called before temporary file slot `upTo - 1` is written: the slots are recorded so a crashed fetch can be purged. */
  reserveFiles(upTo: number): Promise<void>;
}

export interface MigrationFetchResult {
  /** One per package written, in order; at least one. */
  readonly parts: readonly { readonly key: string; readonly counts: MigrationPartCounts }[];
}

/** Runs a connector into one or more packages. It cleans up its own temporary files and written parts when it fails. */
export interface MigrationFetcher {
  fetch(request: MigrationFetchRequest): Promise<MigrationFetchResult>;
}

/** A fetch that failed for a reason the operator can act on. Any other error is reported as `fetch_failed`. */
export class MigrationFetchFailure extends Error {
  constructor(readonly code: MigrationFetchError) {
    super(code);
    this.name = 'MigrationFetchFailure';
  }
}

/** Creating a migration from a connector: the catalog to check the credentials, the box to seal them. */
export interface MigrationConnectorDeps extends MigrationDeps {
  readonly sources: MigrationSourceCatalog;
  readonly secrets: CredentialsBox;
}

/** The `migration.fetch` job. */
export interface MigrationFetchDeps extends MigrationConnectorDeps {
  readonly fetcher: MigrationFetcher;
  /** Least time between two progress writes, in ms (tests set 0). */
  readonly progressIntervalMs?: number | undefined;
}
