import { analyzeMigration, createMigrationFromConnector, createMigrationFromFiles, fetchMigration, type MigrationAnalysisDeps } from '@candydati/core';
import { ORG_A, seedMigrationFetchWorld, userActor } from '@candydati/core/testing';
import { migrationUploadKey } from '@candydati/domain';
import { MIGRATION_LIMITS } from '@candydati/domain';
import { BUILT_IN_MIGRATION_CONNECTORS, createConnectorRegistry, createMigrationFetcher, createMigrationPackageReader, createSecretBox } from '@candydati/providers';
import { createFakeConnector, makePdf, makeZip } from '@candydati/providers/testing';
import { describe, expect, it } from 'vitest';

const owner = userActor({ id: 'user_owner', organizationId: ORG_A, role: 'owner' });
const SECRET = 'Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5';
const credentials = { apiKey: 'sk_live_fake_secret_123', subdomain: 'acme' };

/** The real pieces (secret box, fetcher, builder, split, ZIP, package reader) around the in-memory core. */
function world(options: { jobs: number; perJob: number; files?: number }) {
  const registry = createConnectorRegistry([createFakeConnector({ jobs: options.jobs, perJob: options.perJob })]);
  const base = seedMigrationFetchWorld();
  const deps = {
    ...base,
    sources: registry,
    secrets: createSecretBox(SECRET),
    packages: createMigrationPackageReader(base.files),
    fetcher: createMigrationFetcher({ registry, files: base.files, limits: { ...MIGRATION_LIMITS, files: options.files ?? MIGRATION_LIMITS.files } }),
  };
  return deps;
}

const analyzeAll = async (deps: MigrationAnalysisDeps & { queue: { jobs(): readonly { name: string; payload: unknown }[] } }) => {
  for (const job of deps.queue.jobs().filter((j) => j.name === 'migration.analyze')) await analyzeMigration(deps, job.payload);
};

describe('connector pipeline (fake connector, test only)', () => {
  it('goes from credentials to a ready preview, credentials sealed then wiped, the package valid', async () => {
    const deps = world({ jobs: 2, perJob: 2 });
    const batch = await createMigrationFromConnector(deps, owner, { connectorId: 'fake-ats', credentials });
    const sealed = await deps.migrations.readCredentials(ORG_A, batch.id);
    expect(sealed?.startsWith('sb1.')).toBe(true);
    expect(sealed).not.toContain(credentials.apiKey);
    expect(await fetchMigration(deps, { organizationId: ORG_A, batchId: batch.id })).toBe('fetched');
    expect(await deps.migrations.readCredentials(ORG_A, batch.id)).toBeNull();
    await analyzeAll(deps as never);
    expect(await deps.migrations.findById(ORG_A, batch.id)).toMatchObject({ status: 'ready', sourceSystem: 'fake-ats', producer: 'connector:fake-ats@1', connectorMaturity: 'beta', counts: { jobs: 2, candidates: 4, applications: 4, files: 4 } });
    expect(deps.files.keys()).toEqual([batch.packageKey]);
  });

  it('splits a source too large for one package into parts, each analysed on its own', async () => {
    const deps = world({ jobs: 3, perJob: 2, files: 2 });
    const batch = await createMigrationFromConnector(deps, owner, { connectorId: 'fake-ats', credentials });
    expect(await fetchMigration(deps, { organizationId: ORG_A, batchId: batch.id })).toBe('fetched');
    await analyzeAll(deps as never);
    const parts = (await deps.migrations.list(ORG_A)).filter((b) => b.groupId === batch.id).toSorted((a, b) => (a.part ?? 0) - (b.part ?? 0));
    expect(parts.map((p) => [p.part, p.status, p.counts.jobs, p.counts.fetch?.parts])).toEqual([[1, 'ready', 1, 3], [2, 'ready', 1, 3], [3, 'ready', 1, 3]]);
  });
});

describe('InRecruiting export pipeline (the real connector, assumed columns)', () => {
  it('goes from an uploaded spreadsheet and ZIP of CVs to a ready preview, the uploaded files deleted', async () => {
    const registry = createConnectorRegistry([...BUILT_IN_MIGRATION_CONNECTORS]);
    const base = seedMigrationFetchWorld();
    const deps = { ...base, sources: registry, secrets: createSecretBox(SECRET), packages: createMigrationPackageReader(base.files), fetcher: createMigrationFetcher({ registry, files: base.files }) };
    const sheet = ['Nome;Cognome;Email;Annuncio;Fase;Esito;Punteggio', 'Ada;Bianchi;ada.pipeline@example.com;Backend Developer;Colloquio HR;Scartato;4', 'Bruno;Verdi;bruno.pipeline@example.com;Backend Developer;Offerta;Assunto;5'].join('\n');
    const cvs = makeZip([{ name: 'Ada Bianchi.pdf', content: makePdf(['Ada Bianchi', 'Backend Developer']) }]);
    await deps.files.put(migrationUploadKey(ORG_A, 'inr_1', 'sheet'), new TextEncoder().encode(sheet), 'text/csv');
    await deps.files.put(migrationUploadKey(ORG_A, 'inr_1', 'cvs'), cvs, 'application/zip');
    const batch = await createMigrationFromFiles(deps, owner, { connectorId: 'inrecruiting', batchId: 'inr_1', sheet: { sizeBytes: sheet.length }, cvs: { sizeBytes: cvs.byteLength } });
    expect(await fetchMigration(deps, { organizationId: ORG_A, batchId: batch.id })).toBe('fetched');
    await analyzeAll(deps as never);
    const ready = await deps.migrations.findById(ORG_A, batch.id);
    expect(ready).toMatchObject({ status: 'ready', sourceSystem: 'inrecruiting', connectorMaturity: 'beta', counts: { jobs: 1, candidates: 2, applications: 2, files: 1 } });
    expect(ready?.counts.fetch?.notices).toEqual([{ code: 'columns_ignored', count: 1, headers: ['Punteggio'] }]);
    expect(deps.files.keys()).toEqual([batch.packageKey]);
  });
});
