import { MIGRATION_UPLOAD_NAMES, migrationFilePrefix, migrationPackageKey, migrationUploadKey, type MigrationBatch, type MigrationFetchError } from '@candydati/domain';
import { z } from 'zod';
import { ConflictError } from '../../errors.js';
import { MigrationFetchFailure, type MigrationFetchDeps, type MigrationFetchResult, type MigrationInputFiles, type MigrationSource } from '../../migration-fetch-ports.js';
import { defineSystemJob } from '../../use-case.js';
import { trackFetchProgress, type FetchProgress } from './fetch-progress.js';
import { registerFetchedParts } from './fetch-parts.js';
import { deleteMigrationFile } from './shared.js';

const fetchInput = z.object({ organizationId: z.string().min(1), batchId: z.string().min(1) });

export type MigrationFetchOutcome = 'fetched' | 'failed' | 'skipped';

type Attempt =
  | { readonly ok: true; readonly result: MigrationFetchResult; readonly idOfKey: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly code: MigrationFetchError };

const refused = (code: MigrationFetchError): Attempt => ({ ok: false, code });

/** Part 1 is the batch itself; every later part gets a new batch id, allocated when the fetcher asks for its key. */
function partKeys(deps: MigrationFetchDeps, batch: MigrationBatch): { readonly partKey: (index: number) => string; readonly idOfKey: Map<string, string> } {
  const idOfKey = new Map<string, string>([[batch.packageKey, batch.id]]);
  const keys: string[] = [batch.packageKey];
  return {
    idOfKey,
    partKey: (index) => {
      const known = keys[index];
      if (known !== undefined) return known;
      const id = deps.newId();
      const key = migrationPackageKey(batch.organizationId, id);
      keys[index] = key;
      idOfKey.set(key, id);
      return key;
    },
  };
}

/** Decrypts and re-checks the credentials of an `api` connector. Null when they are gone, a code when unreadable. */
async function openCredentials(deps: MigrationFetchDeps, batch: MigrationBatch, source: MigrationSource): Promise<{ readonly credentials: unknown } | MigrationFetchError> {
  const ciphertext = await deps.migrations.readCredentials(batch.organizationId, batch.id);
  if (ciphertext === null) return 'fetch_interrupted';
  try {
    return { credentials: source.credentials.parse(JSON.parse(deps.secrets.open(ciphertext, batch.id))) };
  } catch {
    return 'fetch_failed';
  }
}

/** The read-only view of what the operator uploaded for a `files` connector. */
function inputFilesOf(deps: MigrationFetchDeps, batch: MigrationBatch): MigrationInputFiles {
  const keyOf = (name: 'sheet' | 'cvs') => migrationUploadKey(batch.organizationId, batch.id, name);
  return {
    sheet: () => deps.files.get(keyOf('sheet')),
    cvs: async () => (batch.counts.fetch?.upload?.cvs === true ? deps.files.get(keyOf('cvs')) : null),
  };
}

/** The credentials (or none, for a `files` connector) and the files the connector gets. */
async function connectorInput(deps: MigrationFetchDeps, batch: MigrationBatch, source: MigrationSource): Promise<{ readonly credentials: unknown; readonly inputFiles?: MigrationInputFiles } | MigrationFetchError> {
  if (source.input === 'files') {
    if (batch.counts.fetch?.upload === undefined) return 'fetch_interrupted';
    const credentials = source.credentials.safeParse({});
    return credentials.success ? { credentials: credentials.data, inputFiles: inputFilesOf(deps, batch) } : 'fetch_failed';
  }
  return openCredentials(deps, batch, source);
}

/** Opens what the connector needs, then runs it. Every failure becomes a code safe to show. */
async function attempt(deps: MigrationFetchDeps, batch: MigrationBatch, tracker: FetchProgress): Promise<Attempt> {
  const source = deps.sources.find(batch.sourceSystem);
  if (!source) return refused('connector_unavailable');
  const input = await connectorInput(deps, batch, source);
  if (typeof input === 'string') return refused(input);
  const { partKey, idOfKey } = partKeys(deps, batch);
  try {
    const result = await deps.fetcher.fetch({
      organizationId: batch.organizationId,
      batchId: batch.id,
      connectorId: source.id,
      credentials: input.credentials,
      ...(input.inputFiles === undefined ? {} : { inputFiles: input.inputFiles }),
      filePrefix: migrationFilePrefix(batch.organizationId, batch.id),
      partKey,
      progress: tracker.progress,
      reserveFiles: tracker.reserveFiles,
    });
    const unknownKey = result.parts.length === 0 || result.parts.some((part) => !idOfKey.has(part.key));
    return unknownKey ? refused('fetch_failed') : { ok: true, result, idOfKey };
  } catch (error) {
    return refused(error instanceof MigrationFetchFailure ? error.code : 'fetch_failed');
  }
}

/** The uploaded files of a `files` connector are personal data: deleted when the credentials would be wiped. */
export async function deleteUploads(deps: MigrationFetchDeps, organizationId: string, batchId: string): Promise<void> {
  for (const name of MIGRATION_UPLOAD_NAMES) await deleteMigrationFile(deps, organizationId, batchId, migrationUploadKey(organizationId, batchId, name));
}

async function fail(deps: MigrationFetchDeps, batch: MigrationBatch, tracker: FetchProgress, code: MigrationFetchError): Promise<'failed'> {
  try {
    // An ended status wipes the credentials in the same write; the reserved slots stay for the purge.
    await deps.migrations.transition(batch.organizationId, batch.id, 'fetching', { status: 'failed', error: code, counts: { ...batch.counts, fetch: tracker.current() }, updatedAt: deps.now() });
  } catch (error) {
    // The reconciler failed it meanwhile: same end.
    if (!(error instanceof ConflictError)) throw error;
  }
  return 'failed';
}

/**
 * Task 6.3, worker of `migration.fetch` (ADR 0009, decision 5): runs the batch's connector with its credentials,
 * decrypted only here, into one package or, when the source is larger than one package can hold, several linked parts
 * (one batch each); then `migration.fetched` is audited and each part's analysis queued. The credentials are wiped as
 * soon as the connector stops, whatever happened (success, refusal, crash, a write that failed). Never retried: the
 * credentials are gone, the operator starts again. A `files` connector gets the uploaded files instead of credentials,
 * and they are deleted at the same moments. A worker that dies mid-fetch is caught by the reconciler.
 */
export const fetchMigration = defineSystemJob<MigrationFetchDeps, typeof fetchInput, MigrationFetchOutcome>({
  name: 'fetchMigration',
  input: fetchInput,
  handler: async ({ deps, input }) => {
    const batch = await deps.migrations.findById(input.organizationId, input.batchId);
    if (!batch || batch.status !== 'fetching') {
      await deps.migrations.wipeCredentials(input.organizationId, input.batchId);
      await deleteUploads(deps, input.organizationId, input.batchId);
      return 'skipped';
    }
    const tracker = trackFetchProgress(deps, batch);
    let outcome: Attempt;
    try {
      outcome = await attempt(deps, batch, tracker);
    } finally {
      await deps.migrations.wipeCredentials(batch.organizationId, batch.id);
      if (batch.counts.fetch?.upload !== undefined) await deleteUploads(deps, batch.organizationId, batch.id);
    }
    if (!outcome.ok) return fail(deps, batch, tracker, outcome.code);
    await registerFetchedParts(deps, batch, outcome.result, outcome.idOfKey, tracker.current());
    return 'fetched';
  },
});
