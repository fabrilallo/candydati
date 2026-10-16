import { describe, expect, it } from 'vitest';
import { buildApplication, ORG_A, seedMigrationCommitWorld } from '../../testing/index.js';
import { deliverQueued } from '../../testing/import-fixtures.js';
import { confirmedMigration } from '../../testing/migration-commit-fixtures.js';
import { answerConsentRequest } from '../imports/consent-request.js';
import { commitMigration } from './commit-migration.js';

/** Carla came without a consent date: one request about her latest application covers both her migrated ones. */
async function asked() {
  const deps = seedMigrationCommitWorld();
  const batch = await confirmedMigration(deps);
  await commitMigration(deps, { organizationId: ORG_A, batchId: batch.id });
  const secrets = await deliverQueued(deps);
  const carla = deps.store.read().applications.filter((a) => a.migrationBatchId === batch.id && a.consentStatus === 'to_renew');
  const secret = carla.map((a) => secrets.get(a.id)).find((value) => value !== undefined);
  if (secret === undefined || carla.length !== 2) throw new Error('expected one request for two applications');
  return { deps, carla, secret };
}

describe('reconfirmation of migrated data', () => {
  it('a yes renews every application of the person the same migration brought, not the others', async () => {
    const { deps, carla, secret } = await asked();
    const other = buildApplication({ id: 'app_other', organizationId: ORG_A, candidateId: carla[0]?.candidateId, consentStatus: 'to_renew' });
    deps.store.write({ applications: [...deps.store.read().applications, other] });
    await answerConsentRequest(deps, { token: secret, scopes: ['selection'] });
    const after = deps.store.read().applications.filter((a) => a.candidateId === carla[0]?.candidateId);
    expect(after.map((a) => [a.id === 'app_other' ? 'other' : 'migrated', a.consentStatus]).toSorted()).toEqual([
      ['migrated', 'given'],
      ['migrated', 'given'],
      ['other', 'to_renew'],
    ]);
    expect(after.find((a) => a.id !== 'app_other')?.consent.origin).toBeUndefined();
  });

  it('a no erases every application of the person the same migration brought', async () => {
    const { deps, carla, secret } = await asked();
    expect(await answerConsentRequest(deps, { token: secret, decline: true })).toEqual({ status: 'declined' });
    expect(deps.store.read().applications.filter((a) => carla.some((c) => c.id === a.id))).toEqual([]);
    expect(deps.store.read().candidates.some((c) => c.id === carla[0]?.candidateId)).toBe(false);
  });
});
