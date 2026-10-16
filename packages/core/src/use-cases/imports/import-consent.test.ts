import { IMPORT_RECONFIRM_DAYS } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildApplication, buildCandidate, fakePdfBytes, ORG_A } from '../../testing/index.js';
import { answerConsentRequest, getConsentRequest } from './consent-request.js';
import { createImportBatch } from './create-import-batch.js';
import { getImportBatch, listImports, setImportItems, updateImportMapping } from './queries.js';
import { requestImportCommit } from './request-commit.js';
import { undoImport } from './undo-import.js';
import { commit, deliverQueued, GIULIA, GIULIA_ROW, importWorld, JOB_2, MARIO, MARIO_ROW, outsider, readyBatch, recruiter } from '../../testing/import-fixtures.js';
import { runRetention } from '../privacy/run-retention.js';

const DAY = 24 * 3600 * 1000;
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('reconfirmation', () => {
  const imported = async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    await commit(deps, batch.id);
    // The worker sends the requests: the secrets exist only in the emails that went out.
    const delivered = await deliverQueued(deps);
    const secrets = [...delivered.values()];
    const byApp = (name: string) => {
      const app = deps.store.read().applications.find((a) => a.cv?.fileName.startsWith(name))!;
      return { app, secret: delivered.get(app.id)! };
    };
    return { deps, batch, secrets, mario: byApp('Mario'), giulia: byApp('Giulia') };
  };

  it('shows the organization, the job and the active notice for a valid token', async () => {
    const { deps, mario } = await imported();
    const request = await getConsentRequest(deps, { token: mario.secret });
    expect(request).toMatchObject({ organization: { name: 'Acme', slug: 'acme' }, job: { title: 'Backend Developer' }, privacyNotice: { version: 1 } });
    expect(JSON.stringify(request)).not.toContain(mario.app.id);
  });

  it('gives consent against the active notice: given, retention recomputed, visible everywhere, single use', async () => {
    const { deps, mario } = await imported();
    const now = deps.now();
    expect(await answerConsentRequest(deps, { token: mario.secret, scopes: ['selection', 'talent_pool'], privacyNoticeVersion: 1 })).toEqual({ status: 'reconfirmed' });
    const app = deps.store.read().applications.find((a) => a.id === mario.app.id)!;
    expect(app).toMatchObject({ consentStatus: 'given', consent: { privacyNoticeId: 'notice_1', privacyNoticeVersion: 1, scopes: ['selection', 'talent_pool'] } });
    expect(app.retentionExpiresAt.getTime()).toBe(now.getTime() + 730 * DAY);
    expect(deps.store.read().candidates.find((c) => c.id === app.candidateId)).toMatchObject({ talentPool: true, retentionExpiresAt: app.retentionExpiresAt });
    expect(deps.auditLog.events().find((e) => e.action === 'candidate.consent_reconfirmed')).toMatchObject({ actor: { type: 'system', id: 'consent_page' }, target: { id: app.id } });
    expect(await rejection(answerConsentRequest(deps, { token: mario.secret, scopes: ['selection'] }))).toBeInstanceOf(ConflictError);
    expect(await rejection(getConsentRequest(deps, { token: mario.secret }))).toMatchObject({ message: 'already_answered' });
  });

  it('refuses a stale notice version, a missing selection scope, an empty answer and a bad token', async () => {
    const { deps, mario } = await imported();
    expect(await rejection(answerConsentRequest(deps, { token: mario.secret, scopes: ['selection'], privacyNoticeVersion: 7 }))).toMatchObject({ message: 'privacy_notice_outdated' });
    expect(await rejection(answerConsentRequest(deps, { token: mario.secret, scopes: ['talent_pool'] }))).toBeInstanceOf(ValidationError);
    expect(await rejection(answerConsentRequest(deps, { token: mario.secret }))).toBeInstanceOf(ValidationError);
    expect(await rejection(getConsentRequest(deps, { token: 'x'.repeat(30) }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(getConsentRequest(deps, { token: 'short' }))).toBeInstanceOf(ValidationError);
    expect(deps.store.read().applications.find((a) => a.id === mario.app.id)?.consentStatus).toBe('to_renew');
  });

  it('erases at once on decline, with reason consent_declined', async () => {
    const { deps, mario, giulia } = await imported();
    expect(await answerConsentRequest(deps, { token: mario.secret, decline: true })).toEqual({ status: 'declined' });
    expect(deps.store.read().applications.some((a) => a.id === mario.app.id)).toBe(false);
    expect(deps.store.read().candidates.some((c) => c.email === 'mario@example.com')).toBe(false);
    expect(deps.files.keys()).not.toContain(mario.app.cv?.key);
    expect(deps.importStore.read().tokens.some((t) => t.applicationId === mario.app.id)).toBe(false);
    expect(deps.auditLog.events().find((e) => e.action === 'candidate.erased')).toMatchObject({ metadata: { reason: 'consent_declined' } });
    expect(await rejection(getConsentRequest(deps, { token: mario.secret }))).toBeInstanceOf(NotFoundError);
    expect(deps.store.read().applications.some((a) => a.id === giulia.app.id)).toBe(true);
  });

  it('treats a link past its expiry as unknown', async () => {
    const { deps, mario } = await imported();
    const later = { ...deps, now: () => new Date(deps.now().getTime() + (IMPORT_RECONFIRM_DAYS + 1) * DAY) };
    expect(await rejection(getConsentRequest(later, { token: mario.secret }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(answerConsentRequest(later, { token: mario.secret, scopes: ['selection'] }))).toBeInstanceOf(NotFoundError);
  });

  it('needs an active privacy notice', async () => {
    const { deps, mario } = await imported();
    const none = { ...deps, privacyNotices: { ...deps.privacyNotices, findActive: async () => null } };
    expect(await rejection(getConsentRequest(none, { token: mario.secret }))).toMatchObject({ message: 'no_privacy_notice' });
    expect(await rejection(answerConsentRequest(none, { token: mario.secret, scopes: ['selection'] }))).toMatchObject({ message: 'no_privacy_notice' });
  });

  it('erases people who did not reconfirm after 30 days (consent_not_renewed) and keeps those who did, without warnings', async () => {
    const { deps, mario, giulia } = await imported();
    await answerConsentRequest(deps, { token: mario.secret, scopes: ['selection'] });
    const early = await runRetention(deps, { now: new Date(deps.now().getTime() + 20 * DAY) });
    expect(early.digests).toEqual([]);
    expect(deps.store.read().applications.some((a) => a.id === giulia.app.id)).toBe(true);
    const result = await runRetention(deps, { now: new Date(deps.now().getTime() + (IMPORT_RECONFIRM_DAYS + 1) * DAY) });
    expect(result.failures).toEqual([]);
    expect(deps.store.read().applications.some((a) => a.id === giulia.app.id)).toBe(false);
    expect(deps.store.read().candidates.some((c) => c.email === 'giulia@example.com')).toBe(false);
    expect(deps.store.read().applications.some((a) => a.id === mario.app.id)).toBe(true);
    expect(deps.auditLog.events().filter((e) => e.action === 'candidate.erased').map((e) => e.metadata.reason)).toEqual(['consent_not_renewed']);
    expect(deps.importStore.read().tokens.map((t) => t.applicationId)).toEqual([mario.app.id]);
  });
});

describe('visibility of people who still have to reconfirm', () => {
  it('hides them from search, from the talent pool, from other jobs and from the profile, and shows them in their own pipeline', async () => {
    const { getPipeline } = await import('../candidates/get-pipeline.js');
    const { searchCandidates } = await import('../candidates/search-candidates.js');
    const { getCandidate } = await import('../candidates/get-candidate.js');
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await commit(deps, batch.id);
    const imported = deps.store.read().candidates.find((c) => c.email === 'mario@example.com')!;
    const search = await searchCandidates(deps, recruiter, {});
    expect(search.items.map((i) => i.candidate.email)).toEqual(['ada@example.com']);
    expect((await searchCandidates(deps, recruiter, { query: 'mario' })).total).toBe(0);
    expect((await searchCandidates(deps, recruiter, { talentPool: true })).total).toBe(0);
    const own = await getPipeline(deps, recruiter, { jobId: 'job_1' });
    expect(own.cards.map((c) => [c.candidate.id, c.application.consentStatus])).toContainEqual([imported.id, 'to_renew']);
    expect((await getPipeline(deps, recruiter, { jobId: JOB_2 })).cards).toEqual([]);
    expect(await rejection(getCandidate(deps, recruiter, { candidateId: imported.id }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(getCandidate(deps, recruiter, { candidateId: imported.id, viaJobId: JOB_2 }))).toBeInstanceOf(NotFoundError);
    const detail = await getCandidate(deps, recruiter, { candidateId: imported.id, viaJobId: 'job_1' });
    expect(detail.applications).toHaveLength(1);
  });

  it('shows them everywhere after reconfirming', async () => {
    const { searchCandidates } = await import('../candidates/search-candidates.js');
    const { getCandidate } = await import('../candidates/get-candidate.js');
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await commit(deps, batch.id);
    const app = deps.store.read().applications.find((a) => a.importBatchId === batch.id)!;
    const secret = (await deliverQueued(deps)).get(app.id)!;
    await answerConsentRequest(deps, { token: secret, scopes: ['selection', 'talent_pool'] });
    expect((await searchCandidates(deps, recruiter, { query: 'mario' })).total).toBe(1);
    expect((await searchCandidates(deps, recruiter, { talentPool: true })).total).toBe(1);
    expect((await getCandidate(deps, recruiter, { candidateId: app.candidateId })).applications).toHaveLength(1);
  });

  it('shows an existing candidate everywhere, but the imported application only inside its job', async () => {
    const { getCandidate } = await import('../candidates/get-candidate.js');
    const { searchCandidates } = await import('../candidates/search-candidates.js');
    const existing = buildCandidate({ organizationId: ORG_A, id: 'cand_9', email: 'mario@example.com' });
    const earlier = buildApplication({ organizationId: ORG_A, id: 'app_9', candidateId: 'cand_9', jobId: JOB_2, cv: { key: 'organizations/org_a/applications/app_9/cv', fileName: 'old.pdf', mediaType: 'application/pdf', sizeBytes: 64 } });
    const deps = importWorld({ candidates: [existing], applications: [earlier] });
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await commit(deps, batch.id);
    const search = await searchCandidates(deps, recruiter, {});
    expect(search.items).toMatchObject([{ candidate: { id: 'cand_9' }, applicationCount: 1 }]);
    expect((await getCandidate(deps, recruiter, { candidateId: 'cand_9' })).applications.map((a) => a.application.id)).toEqual(['app_9']);
    expect((await getCandidate(deps, recruiter, { candidateId: 'cand_9', viaJobId: 'job_1' })).applications).toHaveLength(2);
  });
});

describe('permissions and isolation', () => {
  it('is for owner, admin and recruiter only, and never for keys or the agent', async () => {
    const { userActor, apiKeyActor, agentActor } = await import('../../testing/index.js');
    const deps = importWorld();
    const input = { jobId: 'job_1', stageId: 'received', files: [{ fileName: 'a.csv', bytes: fakePdfBytes() }] };
    for (const role of ['owner', 'admin', 'recruiter'] as const) {
      await expect(createImportBatch(deps, userActor({ organizationId: ORG_A, role }), input)).resolves.toMatchObject({ status: 'uploaded' });
    }
    for (const role of ['hiring_manager', 'interviewer'] as const) {
      expect(await rejection(createImportBatch(deps, userActor({ organizationId: ORG_A, role }), input))).toBeInstanceOf(ForbiddenError);
      expect(await rejection(listImports(deps, userActor({ organizationId: ORG_A, role }), {}))).toBeInstanceOf(ForbiddenError);
      expect(await rejection(undoImport(deps, userActor({ organizationId: ORG_A, role }), { batchId: 'x' }))).toBeInstanceOf(ForbiddenError);
    }
    for (const actor of [apiKeyActor({ organizationId: ORG_A }), agentActor({ organizationId: ORG_A })]) {
      expect(await rejection(createImportBatch(deps, actor, input))).toBeInstanceOf(ForbiddenError);
      expect(await rejection(getImportBatch(deps, actor, { batchId: 'x' }))).toBeInstanceOf(ForbiddenError);
    }
  });

  it('never shows a batch to another organization', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    expect(await rejection(getImportBatch(deps, outsider, { batchId: batch.id }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(updateImportMapping(deps, outsider, { batchId: batch.id, mapping: batch.mapping! }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(setImportItems(deps, outsider, { batchId: batch.id, items: [] }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(requestImportCommit(deps, outsider, { batchId: batch.id }))).toBeInstanceOf(NotFoundError);
    expect(await rejection(undoImport(deps, outsider, { batchId: batch.id }))).toBeInstanceOf(NotFoundError);
    expect(await listImports(deps, outsider, {})).toEqual([]);
    expect((await listImports(deps, recruiter, {})).map((b) => b.id)).toEqual([batch.id]);
  });
});
