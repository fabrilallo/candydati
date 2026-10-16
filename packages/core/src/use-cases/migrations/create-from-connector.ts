import { migrationConnectorInputSchema, migrationPackageKey, type MigrationBatch, type MigrationConnectorDto } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { ValidationError } from '../../errors.js';
import type { MigrationConnectorDeps, MigrationSource } from '../../migration-fetch-ports.js';
import { defineUseCase } from '../../use-case.js';

/**
 * The connector's own schema decides; the refusal names the fields only. A Zod message can quote what it received, and
 * what it received here is a secret: every issue becomes the same code.
 */
function checkCredentials(source: MigrationSource, credentials: unknown): unknown {
  const parsed = source.credentials.safeParse(credentials);
  if (parsed.success) return parsed.data;
  const paths = [...new Set(parsed.error.issues.map((issue) => ['credentials', ...issue.path.map(String)].join('.')))];
  throw new ValidationError(paths.map((path) => ({ path, message: 'invalid_credential' })));
}

const newConnectorBatch = (deps: MigrationConnectorDeps, actor: Actor, id: string, source: MigrationSource): MigrationBatch => ({
  id,
  organizationId: actor.organizationId,
  status: 'fetching',
  sourceSystem: source.id,
  producer: `connector:${source.id}`,
  connectorMaturity: source.maturity,
  createdBy: actor.onBehalfOfUserId ?? actor.id ?? 'system',
  counts: { fetch: { done: 0, total: null } },
  stageMapping: [],
  excludedJobs: [],
  declarations: null,
  packageKey: migrationPackageKey(actor.organizationId, id),
  error: null,
  createdAt: deps.now(),
  updatedAt: deps.now(),
  committedAt: null,
  undoneAt: null,
  purgedAt: null,
  groupId: id,
  part: 1,
});

/**
 * Task 6.3: an owner or admin starts a migration from a built-in connector (ADR 0009, decision 5). The credentials are
 * checked with the connector's schema, sealed (`CredentialsBox`, bound to the batch id) into the batch's own column and
 * never returned, logged or audited; the batch starts `fetching` with the connector's maturity and `migration.fetch` is
 * queued. The fetch wipes them when it ends, whatever happens.
 */
export const createMigrationFromConnector = defineUseCase<MigrationConnectorDeps, typeof migrationConnectorInputSchema, MigrationBatch>({
  name: 'createMigrationFromConnector',
  input: migrationConnectorInputSchema,
  permission: 'migration:manage',
  audit: {
    action: 'migration.created',
    target: (_input, result) => ({ type: 'migration_batch', id: result.id }),
    // Never the credentials: the connector and its maturity only.
    metadata: (input, result) => ({ connectorId: input.connectorId, maturity: result.connectorMaturity }),
  },
  transaction: { skip: 'the batch must be committed before its fetch is queued, like the package upload' },
  handler: async ({ deps, actor, input }) => {
    const source = deps.sources.find(input.connectorId);
    // A refusal on the input, with an issue the web can recognise: the instance does not offer this connector.
    if (!source) throw new ValidationError([{ path: 'connectorId', message: 'connector_unknown' }]);
    const credentials = checkCredentials(source, input.credentials);
    const id = deps.newId();
    const credentialsCiphertext = deps.secrets.seal(JSON.stringify(credentials), id);
    const batch = await deps.migrations.create(newConnectorBatch(deps, actor, id, source), { credentialsCiphertext });
    try {
      await deps.queue.enqueue('migration.fetch', { organizationId: actor.organizationId, batchId: id }, { singletonKey: id });
    } catch {
      // Failing the batch wipes the credentials in the same write.
      return deps.migrations.transition(actor.organizationId, id, 'fetching', { status: 'failed', error: 'queue_unavailable', updatedAt: deps.now() });
    }
    return batch;
  },
});

/** A connector as the web lists it: never its credential schema. */
export const toConnectorDto = (source: MigrationSource): MigrationConnectorDto => ({
  id: source.id,
  label: source.label,
  maturity: source.maturity,
  input: source.input,
  docsUrl: source.docsUrl,
  fields: [...source.fields],
});

/** The connectors this instance offers (empty until vendor connectors ship). Owners and admins only, like the migrations. */
export const listMigrationConnectors = defineUseCase<MigrationConnectorDeps, z.ZodObject, readonly MigrationConnectorDto[]>({
  name: 'listMigrationConnectors',
  input: z.object({}),
  permission: 'migration:manage',
  audit: { skip: 'read-only' },
  handler: async ({ deps }) => deps.sources.list().map(toConnectorDto),
});
