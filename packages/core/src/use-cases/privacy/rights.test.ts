import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { ERASED, KEPT, ORG_A, ORG_B, buildApplication, buildPrivacyNotice, createInMemoryPrivacyNoticeRepository, seedPrivacyData, userActor } from '../../testing/index.js';
import { correctCandidate } from './correct-candidate.js';
import { exportCandidate } from './export-candidate.js';
import { zipCandidateExport } from './build-candidate-export.js';
import { withdrawConsent } from './withdraw-consent.js';
import { candidateExportSchema } from '@candydati/domain';

const recruiter = userActor({ id: 'user_r', role: 'recruiter', organizationId: ORG_A });
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('correctCandidate', () => {
  it('changes the fields, lowercases the email and audits the field names only', async () => {
    const deps = await seedPrivacyData();
    const { detail, fields } = await correctCandidate(deps, recruiter, {
      candidateId: 'cand_1',
      changes: { firstName: 'Zelda-Maria', email: 'NEW.Zelda@Example.org', phone: null },
    });
    expect(fields).toEqual(['firstName', 'email', 'phone']);
    expect(detail.candidate).toMatchObject({ firstName: 'Zelda-Maria', email: 'new.zelda@example.org', phone: null });
    const event = deps.auditLog.events().find((e) => e.action === 'candidate.corrected');
    expect(event).toMatchObject({ target: { type: 'candidate', id: 'cand_1' }, metadata: { fields: ['firstName', 'email', 'phone'] } });
    expect(JSON.stringify(event)).not.toContain('Zelda-Maria');
    expect(JSON.stringify(event)).not.toContain('example.org');
  });

  it('does not count a value sent unchanged', async () => {
    const deps = await seedPrivacyData();
    const { fields } = await correctCandidate(deps, recruiter, { candidateId: 'cand_1', changes: { lastName: ERASED.lastName, email: ERASED.email.toUpperCase() } });
    expect(fields).toEqual([]);
  });

  it('refuses an email that belongs to another candidate with a conflict', async () => {
    const deps = await seedPrivacyData();
    const error = await rejection(correctCandidate(deps, recruiter, { candidateId: 'cand_1', changes: { email: KEPT.email } }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(deps.store.read().candidates.find((c) => c.id === 'cand_1')?.email).toBe(ERASED.email);
  });

  it('refuses an empty correction, foreign candidates and roles without update', async () => {
    const deps = await seedPrivacyData();
    expect(await rejection(correctCandidate(deps, recruiter, { candidateId: 'cand_1', changes: {} }))).toBeInstanceOf(ValidationError);
    expect(await rejection(correctCandidate(deps, userActor({ organizationId: ORG_B }), { candidateId: 'cand_1', changes: { firstName: 'X' } }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(correctCandidate(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), { candidateId: 'cand_1', changes: { firstName: 'X' } }))).toBeInstanceOf(ForbiddenError);
  });
});

describe('withdrawConsent', () => {
  it('selection: erases the application with reason consent_withdrawn', async () => {
    const deps = await seedPrivacyData();
    const result = await withdrawConsent(deps, recruiter, { applicationId: 'app_1', scope: 'selection' });
    expect(result).toEqual({ erased: true, candidateErased: false });
    expect(deps.store.read().applications.map((a) => a.id)).toEqual(['app_2', 'app_3']);
    const events = deps.auditLog.events().filter((e) => e.action === 'candidate.erased');
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toEqual({ reason: 'consent_withdrawn', applicationCount: 1 });
    expect(deps.auditLog.events().filter((e) => e.action === 'candidate.updated')).toHaveLength(0);
  });

  it('talent_pool: leaves the pool and recomputes retention on the selection scope', async () => {
    const givenAt = new Date('2026-01-01T00:00:00Z');
    const deps = await seedPrivacyData({
      applications: [
        buildApplication({ id: 'app_1', candidateId: 'cand_1', organizationId: ORG_A, consent: { privacyNoticeId: 'notice_1', privacyNoticeVersion: 1, scopes: ['selection', 'talent_pool'], givenAt }, retentionExpiresAt: new Date('2027-12-31T00:00:00Z') }),
      ],
      extractions: [],
      notes: [],
      messaging: {},
      tasks: [],
      outbox: [],
      candidates: [{ ...(await seedPrivacyData()).store.read().candidates[0]!, talentPool: true }],
      overrides: { privacyNotices: createInMemoryPrivacyNoticeRepository([buildPrivacyNotice({ organizationId: ORG_A, retentionDays: { selection: 100, talent_pool: 700 } })]) },
    });
    const result = await withdrawConsent(deps, recruiter, { applicationId: 'app_1', scope: 'talent_pool' });
    if (result.erased) throw new Error('should not erase');
    const expected = new Date(givenAt.getTime() + 100 * 24 * 3600 * 1000);
    expect(result.detail.candidate).toMatchObject({ talentPool: false, retentionExpiresAt: expected });
    expect(result.detail.applications[0]?.application).toMatchObject({ retentionExpiresAt: expected, consent: { scopes: ['selection'] } });
    const event = deps.auditLog.events().find((e) => e.action === 'candidate.updated');
    expect(event).toMatchObject({ target: { type: 'candidate', id: 'cand_1' }, metadata: { fields: ['consent'], scope: 'talent_pool' } });
  });

  it('refuses foreign applications and roles without update', async () => {
    const deps = await seedPrivacyData();
    expect(await rejection(withdrawConsent(deps, userActor({ organizationId: ORG_B }), { applicationId: 'app_1', scope: 'selection' }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(withdrawConsent(deps, userActor({ role: 'interviewer', organizationId: ORG_A }), { applicationId: 'app_1', scope: 'selection' }))).toBeInstanceOf(ForbiddenError);
    expect(deps.store.read().applications).toHaveLength(3);
  });

  it('lets a hiring manager withdraw talent-pool consent but not selection consent, which erases data', async () => {
    const deps = await seedPrivacyData();
    const manager = userActor({ role: 'hiring_manager', organizationId: ORG_A });
    expect(await rejection(withdrawConsent(deps, manager, { applicationId: 'app_1', scope: 'selection' }))).toBeInstanceOf(ForbiddenError);
    expect(deps.store.read().applications).toHaveLength(3);
    expect(await withdrawConsent(deps, manager, { applicationId: 'app_1', scope: 'talent_pool' })).toMatchObject({ erased: false });
  });
});

describe('exportCandidate', () => {
  it('returns candidate.json in the public schema with applications, messages, notes, extraction and the CV files', async () => {
    const deps = await seedPrivacyData();
    const { json, files, missingFiles } = await exportCandidate(deps, recruiter, { candidateId: 'cand_1' });
    expect(candidateExportSchema.safeParse(json).success).toBe(true);
    expect(json.candidate).toMatchObject({ id: 'cand_1', email: ERASED.email, firstName: ERASED.firstName });
    expect(json.applications.map((a) => a.id)).toEqual(['app_1', 'app_2']);
    expect(json.applications[0]).toMatchObject({ jobTitle: 'Backend Developer', cv: { path: 'files/app_1/zelda.pdf', fileName: 'zelda.pdf' } });
    expect(json.applications[0]?.messages).toHaveLength(2);
    expect(json.applications[0]?.extraction?.status).toBe('done');
    expect(json.notes.map((n) => n.id).toSorted()).toEqual(['note_1', 'note_2']);
    expect(files.map((f) => f.path)).toEqual(['files/app_1/zelda.pdf', 'files/app_2/zelda-2.pdf']);
    expect(missingFiles).toEqual([]);
    expect(JSON.stringify(json)).not.toContain(KEPT.email);
  });

  it('lists a CV that cannot be read as missing instead of failing', async () => {
    const deps = await seedPrivacyData();
    await deps.files.delete('organizations/org_a/applications/app_2/cv');
    const { files, missingFiles } = await exportCandidate(deps, recruiter, { candidateId: 'cand_1' });
    expect(files).toHaveLength(1);
    expect(missingFiles).toEqual(['files/app_2/zelda-2.pdf']);
  });

  it('is audited with counts only', async () => {
    const deps = await seedPrivacyData();
    await exportCandidate(deps, recruiter, { candidateId: 'cand_1' });
    expect(deps.auditLog.events().find((e) => e.action === 'candidate.exported')).toMatchObject({
      target: { type: 'candidate', id: 'cand_1' },
      metadata: { applicationCount: 2, fileCount: 2, missingFileCount: 0 },
    });
  });

  it('zips candidate.json and the files through a ZipWriter', async () => {
    const deps = await seedPrivacyData();
    const bundle = await exportCandidate(deps, recruiter, { candidateId: 'cand_1' });
    const zip = deps.zip();
    await zipCandidateExport(zip, bundle);
    expect(deps.zip.writers()[0]?.entries().map((e) => e.path)).toEqual(['candidate.json', 'files/app_1/zelda.pdf', 'files/app_2/zelda-2.pdf']);
  });

  it('refuses foreign candidates and roles without export', async () => {
    const deps = await seedPrivacyData();
    expect(await rejection(exportCandidate(deps, userActor({ organizationId: ORG_B }), { candidateId: 'cand_1' }))).toBeInstanceOf(NotFoundError);
    for (const role of ['hiring_manager', 'interviewer'] as const) {
      expect(await rejection(exportCandidate(deps, userActor({ role, organizationId: ORG_A }), { candidateId: 'cand_1' }))).toBeInstanceOf(ForbiddenError);
    }
    expect(deps.auditLog.events().filter((e) => e.action === 'candidate.exported')).toHaveLength(0);
  });
});
