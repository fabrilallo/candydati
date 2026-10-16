import { migrationPackageKey } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, ORG_A } from '../../testing/index.js';
import { migrationAdmin, migrationOwner, migrationRecruiter } from '../../testing/migration-fixtures.js';
import { FAKE_CREDENTIALS, FAKE_SOURCE, fakeCredentialsBox, seedMigrationFetchWorld } from '../../testing/migration-fetch.js';
import { createMigrationFromConnector, listMigrationConnectors } from './create-from-connector.js';

const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const input = { connectorId: FAKE_SOURCE.id, credentials: { ...FAKE_CREDENTIALS } };

describe('createMigrationFromConnector', () => {
  it('seals the credentials into the batch, starts it fetching with the connector maturity, queues the fetch and audits', async () => {
    const deps = seedMigrationFetchWorld();
    const batch = await createMigrationFromConnector(deps, migrationOwner, input);
    expect(batch).toMatchObject({
      organizationId: ORG_A,
      status: 'fetching',
      sourceSystem: 'fake-ats',
      producer: 'connector:fake-ats',
      connectorMaturity: 'beta',
      createdBy: 'user_owner',
      counts: { fetch: { done: 0, total: null } },
      groupId: batch.id,
      part: 1,
      packageKey: migrationPackageKey(ORG_A, batch.id),
    });
    const sealed = await deps.migrations.readCredentials(ORG_A, batch.id);
    expect(sealed).not.toBeNull();
    expect(sealed).not.toContain(FAKE_CREDENTIALS.apiKey);
    expect(JSON.parse(fakeCredentialsBox.open(sealed ?? '', batch.id))).toEqual(FAKE_CREDENTIALS);
    expect(deps.queue.jobs()).toEqual([{ name: 'migration.fetch', payload: { organizationId: ORG_A, batchId: batch.id } }]);
    const events = deps.auditLog.events();
    expect(events.map((e) => [e.action, e.target, e.metadata])).toEqual([['migration.created', { type: 'migration_batch', id: batch.id }, { connectorId: 'fake-ats', maturity: 'beta' }]]);
    expect(JSON.stringify(events)).not.toContain(FAKE_CREDENTIALS.apiKey);
    expect(JSON.stringify(batch)).not.toContain(FAKE_CREDENTIALS.apiKey);
  });

  it('is for owner and admin only, never a recruiter, an API key or the agent', async () => {
    const deps = seedMigrationFetchWorld();
    expect((await createMigrationFromConnector(deps, migrationAdmin, input)).status).toBe('fetching');
    for (const actor of [migrationRecruiter, apiKeyActor({ organizationId: ORG_A }), agentActor({ organizationId: ORG_A })]) {
      expect(await rejection(createMigrationFromConnector(deps, actor, input))).toBeInstanceOf(ForbiddenError);
    }
  });

  it('refuses an unknown connector and credentials the connector schema refuses, naming fields and never values', async () => {
    const deps = seedMigrationFetchWorld();
    expect(await rejection(createMigrationFromConnector(deps, migrationOwner, { ...input, connectorId: 'nope' }))).toBeInstanceOf(NotFoundError);
    const refused = (await rejection(createMigrationFromConnector(deps, migrationOwner, { ...input, credentials: { apiKey: 'short', subdomain: 'Bad Sub!' } }))) as ValidationError;
    expect(refused).toBeInstanceOf(ValidationError);
    expect(refused.issues).toEqual([
      { path: 'credentials.apiKey', message: 'invalid_credential' },
      { path: 'credentials.subdomain', message: 'invalid_credential' },
    ]);
    expect(JSON.stringify(refused.issues)).not.toContain('short');
    const extra = (await rejection(createMigrationFromConnector(deps, migrationOwner, { ...input, credentials: { ...FAKE_CREDENTIALS, other: 'x' } }))) as ValidationError;
    expect(extra.issues).toEqual([{ path: 'credentials', message: 'invalid_credential' }]);
    expect(deps.migrationStore.read().batches).toEqual([]);
    expect(deps.migrationStore.read().credentials).toEqual([]);
    expect(deps.auditLog.events()).toEqual([]);
  });

  it('fails the batch and wipes the credentials when the fetch cannot be queued', async () => {
    const deps = seedMigrationFetchWorld({ migrationOverrides: { queue: { async enqueue() { throw new Error('down'); }, jobs: () => [] } } });
    const batch = await createMigrationFromConnector(deps, migrationOwner, input);
    expect(batch).toMatchObject({ status: 'failed', error: 'queue_unavailable' });
    expect(await deps.migrations.readCredentials(ORG_A, batch.id)).toBeNull();
  });
});

describe('listMigrationConnectors', () => {
  it('lists the catalog without the credential schemas, for owners and admins only', async () => {
    const deps = seedMigrationFetchWorld();
    const listed = await listMigrationConnectors(deps, migrationOwner, {});
    expect(listed).toEqual([{ id: 'fake-ats', label: 'Fake ATS', maturity: 'beta', input: 'api', docsUrl: 'https://docs.example.com/api', fields: FAKE_SOURCE.fields }]);
    expect(listed[0]).not.toHaveProperty('credentials');
    expect(await rejection(listMigrationConnectors(deps, migrationRecruiter, {}))).toBeInstanceOf(ForbiddenError);
  });
});
