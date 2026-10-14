import { describe, expect, it } from 'vitest';
import type { ErasureTransaction } from '../../privacy-ports.js';
import { buildApplication, ORG_A, seedPrivacyData } from '../../testing/index.js';
import { runRetention } from './run-retention.js';

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2027-06-01T03:00:00Z');
const at = (days: number): Date => new Date(NOW.getTime() + days * DAY);
const cv = (id: string) => ({ key: `organizations/org_a/applications/${id}/cv`, fileName: 'cv.pdf', mediaType: 'application/pdf' as const, sizeBytes: 64 });

type Seeded = Awaited<ReturnType<typeof seedPrivacyData>>;

/** An erasure that lets `meanwhile` change the data after the scan, right before the erasure transaction starts. */
const racing = (deps: Seeded, meanwhile: () => Promise<void>): ErasureTransaction => ({
  run: async (work) => {
    await meanwhile();
    return deps.erasure.run(work);
  },
});

describe('runRetention re-checks under lock (#2)', () => {
  it('keeps an application whose retention was extended between the scan and the erasure', async () => {
    const seeded = await seedPrivacyData({
      applications: [buildApplication({ id: 'app_1', organizationId: ORG_A, candidateId: 'cand_1', retentionExpiresAt: at(-1), cv: cv('app_1') })],
    });
    const deps = { ...seeded, erasure: racing(seeded, async () => void (await seeded.applications.update(ORG_A, 'app_1', { retentionExpiresAt: at(365) }))) };
    const result = await runRetention(deps, { now: NOW });
    expect(seeded.store.read().applications.map((a) => a.id)).toEqual(['app_1']);
    expect(seeded.files.keys()).toContain(cv('app_1').key);
    expect(result.runs).toEqual([]);
    expect(seeded.auditLog.events().filter((e) => e.action === 'candidate.erased')).toEqual([]);
  });

  it('keeps an imported person who reconfirmed between the scan and the erasure', async () => {
    const seeded = await seedPrivacyData({
      applications: [
        buildApplication({ id: 'app_1', organizationId: ORG_A, candidateId: 'cand_1', retentionExpiresAt: at(-1), consentStatus: 'to_renew', reconfirmationSentAt: at(-31), cv: cv('app_1') }),
      ],
    });
    const deps = { ...seeded, erasure: racing(seeded, async () => void (await seeded.applications.update(ORG_A, 'app_1', { consentStatus: 'given' }))) };
    await runRetention(deps, { now: NOW });
    expect(seeded.store.read().applications.map((a) => a.id)).toEqual(['app_1']);
  });

  it('erases only the applications still expired, and keeps the candidate when one of them was extended meanwhile', async () => {
    const seeded = await seedPrivacyData({
      applications: ['app_1', 'app_2'].map((id) => buildApplication({ id, organizationId: ORG_A, candidateId: 'cand_1', retentionExpiresAt: at(-1), cv: cv(id) })),
    });
    const deps = { ...seeded, erasure: racing(seeded, async () => void (await seeded.applications.update(ORG_A, 'app_2', { retentionExpiresAt: at(30) }))) };
    const result = await runRetention(deps, { now: NOW });
    expect(seeded.store.read().applications.map((a) => a.id)).toEqual(['app_2']);
    expect(seeded.store.read().candidates.map((c) => c.id)).toContain('cand_1');
    expect(result.runs).toMatchObject([{ organizationId: ORG_A, erased: 1 }]);
  });
});

describe('runRetention pages through the scan', () => {
  it('reads the expiring applications a page at a time and still handles every one of them', async () => {
    const ids = ['app_1', 'app_2', 'app_3', 'app_4', 'app_5'];
    const seeded = await seedPrivacyData({
      applications: ids.map((id, index) => buildApplication({ id, organizationId: ORG_A, candidateId: index < 2 ? 'cand_1' : 'cand_2', retentionExpiresAt: at(-1 - index), cv: cv(id) })),
    });
    const pages: (number | undefined)[] = [];
    const scan = seeded.applications.listRetentionExpiringAcrossOrganizations.bind(seeded.applications);
    const deps = { ...seeded, applications: { ...seeded.applications, listRetentionExpiringAcrossOrganizations: async (...args: Parameters<typeof scan>) => (pages.push(args[1]?.limit), scan(...args)) } };
    const result = await runRetention(deps, { now: NOW, pageSize: 2 });
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.every((limit) => limit === 2)).toBe(true);
    expect(seeded.store.read().applications).toEqual([]);
    expect(result.runs).toMatchObject([{ organizationId: ORG_A, erased: 5 }]);
  });
});
