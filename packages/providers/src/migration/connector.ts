import type { MigrationConnectorField, MigrationConnectorInput, MigrationConnectorMaturity } from '@candydati/domain';
import type { z } from 'zod';
import type { HostRule, JsonReader, RateOptions } from '../http/index.js';
import type { PackageBuilder } from './package-builder.js';

/** What a connector gets besides its credentials: the only way out to the network, and a progress callback. */
export interface ConnectorTools {
  /**
   * GET-only JSON and file reader, limited to `hosts(credentials)`, DNS-pinned, rate-limit aware. A connector never
   * opens a socket of its own and never writes to the source.
   */
  readonly reader: JsonReader;
  /** Items read so far, and the total when the source says it. Also keeps the batch alive: call it at least once a minute. */
  progress(done: number, total?: number | null): Promise<void>;
}

/**
 * One built-in source connector (ADR 0009, Phase 6). It reads the vendor's API (or export files) and writes what it finds
 * through the `PackageBuilder`, which has no way to set a field the package refuses (scores, ratings, demographic data,
 * photos, birth dates). It is `beta` until a real migration confirms it (decision 6).
 */
export interface MigrationConnector<Credentials = unknown> {
  /** Lowercase, stable: stored as the batch source and in the audit log. */
  readonly id: string;
  /** The vendor product name. */
  readonly label: string;
  readonly maturity: MigrationConnectorMaturity;
  readonly input: MigrationConnectorInput;
  /** The public documentation the connector follows. */
  readonly docsUrl: string;
  /** The credentials form; every secret is a password field. */
  readonly fields: readonly MigrationConnectorField[];
  /** Checked when the migration starts and again when the fetch runs. */
  readonly credentials: z.ZodType<Credentials>;
  /** The vendor's API hosts, and only those (a subdomain rule for vendors whose host carries the customer's name). */
  hosts(credentials: Credentials): readonly HostRule[];
  /** The vendor's documented request rate, enforced by the reader. */
  readonly rate?: RateOptions | undefined;
  /** Pulls everything into the builder. Never writes to the source. */
  fetch(credentials: Credentials, builder: PackageBuilder, tools: ConnectorTools): Promise<void>;
}

/** Builds a connector with its credential type checked against its own schema. */
export const defineMigrationConnector = <Credentials>(connector: MigrationConnector<Credentials>): MigrationConnector<Credentials> => Object.freeze(connector);
