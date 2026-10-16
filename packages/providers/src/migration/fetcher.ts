import { MigrationFetchFailure, type FileStorage, type MigrationFetcher, type MigrationFetchRequest } from '@candydati/core';
import { MIGRATION_FETCH_ERRORS, MIGRATION_LIMITS, type MigrationFetchError } from '@candydati/domain';
import { createJsonReader, JsonReaderError, type HostRule, type JsonReader, type RateOptions } from '../http/index.js';
import { createPackageBuilder, PackageBuilderError } from './package-builder.js';
import { splitPackage, type PartLimits } from './package-split.js';
import { writePackagePart } from './package-writer.js';
import type { MigrationConnectorRegistry } from './registry.js';

/** What a failed fetch says in the worker log: names and codes, never a message, a URL or a value. */
export interface FetchErrorInfo {
  readonly name: string;
  readonly code?: string | undefined;
  readonly kind?: string | undefined;
  readonly paths?: readonly string[] | undefined;
}

export interface MigrationFetcherOptions {
  readonly registry: MigrationConnectorRegistry;
  readonly files: Pick<FileStorage, 'get' | 'putStream' | 'delete'>;
  readonly limits?: PartLimits | undefined;
  /** The reader each run gets, limited to the connector's hosts. Tests inject one bound to a local server. */
  readonly readerFor?: ((hosts: readonly HostRule[], rate: RateOptions | undefined) => JsonReader) | undefined;
  readonly maxFileBytes?: number | undefined;
  readonly now?: (() => Date) | undefined;
  readonly onError?: ((info: FetchErrorInfo) => void) | undefined;
}

const KNOWN: ReadonlySet<string> = new Set(MIGRATION_FETCH_ERRORS);

/** The operator-facing code of a failure, or null for an unexpected error (the core reports `fetch_failed`). */
function codeOf(error: unknown): MigrationFetchError | null {
  if (error instanceof MigrationFetchFailure) return error.code;
  if (error instanceof JsonReaderError) {
    if (KNOWN.has(error.code)) return error.code as MigrationFetchError;
    return error.code === 'host_not_allowed' ? 'source_unavailable' : 'source_invalid_response';
  }
  if (error instanceof PackageBuilderError) return error.code === 'part_too_large' ? 'part_too_large' : 'source_invalid_response';
  return null;
}

const infoOf = (error: unknown): FetchErrorInfo => {
  if (error instanceof PackageBuilderError) return { name: error.name, code: error.code, kind: error.kind, paths: error.paths };
  if (error instanceof JsonReaderError || error instanceof MigrationFetchFailure) return { name: error.name, code: error.code };
  return { name: error instanceof Error ? error.name : typeof error };
};

const defaultReaderFor = (hosts: readonly HostRule[], rate: RateOptions | undefined): JsonReader => createJsonReader({ allowedHosts: hosts, ...(rate === undefined ? {} : { rate }) });

/**
 * The core's `MigrationFetcher` (Task 6.3): runs a registered connector with a reader limited to its hosts and a
 * `PackageBuilder`, splits what it collected into packages within MIGRATION_LIMITS, and writes each one at the key the
 * core gives for its part. Temporary files are deleted whatever happens; parts already written are deleted on failure.
 */
export function createMigrationFetcher(options: MigrationFetcherOptions): MigrationFetcher {
  const readerFor = options.readerFor ?? defaultReaderFor;
  const now = options.now ?? (() => new Date());
  return {
    async fetch(request: MigrationFetchRequest) {
      const connector = options.registry.get(request.connectorId);
      if (!connector) throw new MigrationFetchFailure('connector_unavailable');
      const credentials = connector.credentials.parse(request.credentials);
      const builder = createPackageBuilder({
        files: options.files,
        filePrefix: request.filePrefix,
        source: { system: connector.id, producer: `connector:${connector.id}@1`, exportedAt: now().toISOString() },
        reserveFiles: request.reserveFiles,
        maxFileBytes: options.maxFileBytes,
      });
      const written: string[] = [];
      let done = 0;
      let total: number | null = null;
      const progress = async (d: number, t?: number | null): Promise<void> => {
        done = d;
        total = t ?? null;
        await request.progress(d, total);
      };
      try {
        await connector.fetch(credentials, builder, { reader: readerFor(connector.hosts(credentials), connector.rate), progress });
        const parts = splitPackage(builder.collected(), options.limits ?? MIGRATION_LIMITS);
        for (const [index, part] of parts.entries()) {
          const key = request.partKey(index);
          written.push(key);
          await writePackagePart(options.files, key, part, () => request.progress(done, total));
        }
        return { parts: parts.map((part, index) => ({ key: written[index] ?? '', counts: part.counts })) };
      } catch (error) {
        options.onError?.(infoOf(error));
        for (const key of written) await options.files.delete(key).catch(() => undefined);
        const code = codeOf(error);
        throw code === null ? error : new MigrationFetchFailure(code);
      } finally {
        await builder.discard();
      }
    },
  };
}
