import { CONSENT_LINK, IMPORT_RECONFIRM_DAYS, isPlaceholderEmail } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../errors.js';
import { buildApplication, buildCandidate, createInMemoryTaskQueue, ORG_A } from '../../testing/index.js';
import { commitImport } from './commit-import.js';
import { answerConsentRequest } from './consent-request.js';
import { getImportBatch, setImportItems } from './queries.js';
import { requestImportCommit } from './request-commit.js';
import { undoImport } from './undo-import.js';
import { commit, deliverQueued, GIULIA, GIULIA_ROW, importWorld, JOB_2, MARIO, MARIO_ROW, readyBatch, recruiter } from '../../testing/import-fixtures.js';

const DAY = 24 * 3600 * 1000;
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('commitImport', () => {
  it('creates to_renew candidates and applications with the CV, extraction, note, token and email, then purges the working data', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    const done = await commit(deps, batch.id);
    expect(done).toMatchObject({ status: 'done', sourceFiles: [], counts: { imported: 2, merged: 0, failed: 0, emailsQueued: 2 } });
    const candidates = deps.store.read().candidates.filter((c) => c.importBatchId === batch.id);
    expect(candidates.map((c) => c.email).toSorted()).toEqual(['giulia@example.com', 'mario@example.com']);
    const expected = new Date(done.importedAt!.getTime() + IMPORT_RECONFIRM_DAYS * DAY);
    const apps = deps.store.read().applications.filter((a) => a.importBatchId === batch.id);
    expect(apps).toHaveLength(2);
    expect(apps.every((a) => a.consentStatus === 'to_renew' && a.source === 'import' && a.stageId === 'received' && a.outcome === null && a.consent.scopes.length === 0 && a.retentionExpiresAt.getTime() === expected.getTime())).toBe(true);
    expect(candidates.every((c) => !c.talentPool && c.retentionExpiresAt.getTime() === expected.getTime())).toBe(true);
    for (const a of apps) expect(deps.files.keys()).toContain(a.cv?.key);
    const mario = apps.find((a) => a.cv?.fileName === 'Mario_Rossi.pdf')!;
    expect(deps.store.read().extractions.find((e) => e.applicationId === mario.id)).toMatchObject({ status: 'text_only', text: 'CV text of Mario Rossi', source: 'text' });
    expect(deps.store.read().notes.filter((n) => n.applicationId === mario.id)).toMatchObject([{ body: 'Ottimo colloquio', authorId: 'user_rec' }]);
    expect(candidates.find((c) => c.email === 'mario@example.com')).toMatchObject({ phone: '333 111', tags: ['java'] });
    const messages = deps.messagingStore.read().messages.filter((m) => m.applicationId === mario.id);
    expect(messages).toMatchObject([{ status: 'queued', sentBy: 'system', direction: 'outbound' }]);
    // The link is put in at send time: the stored body holds the placeholder, never a secret.
    expect(messages[0]?.bodyText).toContain(CONSENT_LINK);
    expect(messages[0]?.bodyText).not.toContain('/consent/');
    expect(deps.queue.jobs().filter((j) => j.name === 'email.send')).toHaveLength(2);
    expect(deps.importStore.read().tokens).toHaveLength(2);
    expect(deps.importStore.read().tokens.every((t) => t.expiresAt.getTime() === expected.getTime() && t.usedAt === null)).toBe(true);
    // Working data is gone: items, analysis and every file of the batch prefix.
    expect(deps.importStore.read().items).toEqual([]);
    expect(deps.importStore.read().analyses).toEqual([]);
    expect(deps.files.keys().filter((k) => k.includes('/imports/'))).toEqual([]);
    expect(deps.auditLog.events().find((e) => e.action === 'import.committed')).toMatchObject({ actor: { type: 'system' }, target: { id: batch.id }, metadata: { imported: 2, jobId: 'job_1' } });
    expect(JSON.stringify(deps.auditLog.events())).not.toMatch(/Mario|Rossi|mario@/);
  });

  it('records a stage event at intake for every imported application, so the funnel counts them', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    const done = await commit(deps, batch.id);
    const apps = deps.store.read().applications.filter((a) => a.importBatchId === batch.id);
    const events = deps.store.read().stageEvents.filter((e) => apps.some((a) => a.id === e.applicationId));
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.fromStageId === null && e.toStageId === 'received' && e.actorType === 'system' && e.outcome === null && !e.backfilled && e.occurredAt.getTime() === done.importedAt!.getTime())).toBe(true);
  });

  it('only imports included items, and a person without email gets no token and no email', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA, { file: 'Anna_Verdi.pdf', name: 'Anna Verdi' }], [MARIO_ROW]);
    const items = (await getImportBatch(deps, recruiter, { batchId: batch.id })).items;
    const giulia = items.find((i) => i.proposal.cv?.fileName === 'Giulia_Bianchi.docx')!;
    await setImportItems(deps, recruiter, { batchId: batch.id, items: [{ itemId: giulia.id, included: false }] });
    const done = await commit(deps, batch.id);
    expect(done.counts).toMatchObject({ imported: 2, noEmail: 2, emailsQueued: 1 });
    const anna = deps.store.read().candidates.find((c) => c.firstName === 'Anna')!;
    expect(isPlaceholderEmail(anna.email)).toBe(true);
    expect(deps.store.read().candidates.some((c) => c.firstName === 'Giulia')).toBe(false);
    expect(deps.importStore.read().tokens).toHaveLength(1);
  });

  it('adds only an application to someone who already exists, without touching their data', async () => {
    const existing = buildCandidate({ organizationId: ORG_A, id: 'cand_9', email: 'mario@example.com', firstName: 'Marione', lastName: 'Rossi', phone: null, tags: ['old'] });
    const deps = importWorld({ candidates: [existing], applications: [] });
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const done = await commit(deps, batch.id);
    expect(done.counts).toMatchObject({ imported: 1, merged: 1 });
    expect(deps.store.read().candidates).toEqual([existing]);
    expect(deps.store.read().applications).toMatchObject([{ candidateId: 'cand_9', consentStatus: 'to_renew', importBatchId: batch.id }]);
  });

  it('skips a person with an open application to the job and reports it', async () => {
    const deps = importWorld({ candidates: [buildCandidate({ organizationId: ORG_A, id: 'cand_9', email: 'mario@example.com' })], applications: [buildApplication({ organizationId: ORG_A, id: 'app_9', candidateId: 'cand_9', jobId: 'job_1' })] });
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    const done = await commit(deps, batch.id);
    expect(done.counts).toMatchObject({ imported: 1, failed: 1 });
    expect(deps.store.read().applications.filter((a) => a.importBatchId === batch.id)).toHaveLength(1);
    expect(deps.files.keys().filter((k) => k.includes('/applications/') && !k.includes(deps.store.read().applications.find((a) => a.importBatchId === batch.id)!.id))).toEqual([]);
  });

  it('rejects unreadable or unsupported CVs one by one and fails the batch when nothing went in', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [{ ...MARIO, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }], [MARIO_ROW]);
    const done = await commit(deps, batch.id);
    expect(done).toMatchObject({ status: 'failed', error: 'nothing_imported', counts: { imported: 0, failed: 1 } });
    expect(deps.store.read().candidates.filter((c) => c.importBatchId === batch.id)).toEqual([]);
  });

  it('isolates a failing item: the others go in, and its stored error is a code, never the error text (#13)', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    let calls = 0;
    const errors: (string | null)[] = [];
    const commitRun = deps.commit.run.bind(deps.commit);
    const spied: typeof deps.commit = {
      run: (work) =>
        commitRun((repos) =>
          work({ ...repos, importItems: { ...repos.importItems, setStatus: async (...args: Parameters<typeof repos.importItems.setStatus>) => (errors.push(args[3]), repos.importItems.setStatus(...args)) } }),
        ),
    };
    const failing = {
      ...deps,
      commit: spied,
      newSecret: () => {
        calls += 1;
        if (calls === 1) throw new Error('insert failed for mario@example.com (Mario Rossi)');
        return `consent-secret-${calls}-abcdefghijkl`;
      },
    };
    await requestImportCommit(deps, recruiter, { batchId: batch.id });
    const { commitImport } = await import('./commit-import.js');
    const done = await commitImport(failing, { organizationId: ORG_A, batchId: batch.id });
    expect(done).toMatchObject({ status: 'done', counts: { imported: 1, failed: 1, emailsQueued: 1 } });
    expect(deps.store.read().applications.filter((a) => a.importBatchId === batch.id)).toHaveLength(1);
    expect(deps.importStore.read().tokens).toHaveLength(1);
    expect(deps.messagingStore.read().messages).toHaveLength(1);
    expect(errors).toContain('write_failed');
    expect(JSON.stringify(errors)).not.toMatch(/mario|Rossi/i);
    expect(deps.files.keys().filter((k) => k.includes('/applications/'))).toHaveLength(1);
  });

  it('fails a whole chunk with a code when the job closed, leaving no row and no copied file', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    await requestImportCommit(deps, recruiter, { batchId: batch.id });
    const closed = { ...deps, commit: { run: () => Promise.reject(new ConflictError('job_closed')) } };
    const { commitImport } = await import('./commit-import.js');
    const done = await commitImport(closed, { organizationId: ORG_A, batchId: batch.id });
    expect(done).toMatchObject({ status: 'failed', counts: { imported: 0, failed: 2 } });
    expect(deps.files.keys().filter((k) => k.includes('/applications/'))).toEqual([]);
  });

  it('rethrows a transient database error so the queue retries the task, and the items stay pending (#13)', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    await requestImportCommit(deps, recruiter, { batchId: batch.id });
    const deadlock = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    const flaky = { ...deps, commit: { run: () => Promise.reject(deadlock) } };
    const { commitImport } = await import('./commit-import.js');
    await expect(commitImport(flaky, { organizationId: ORG_A, batchId: batch.id })).rejects.toBe(deadlock);
    expect((await deps.importItems.listAll(ORG_A, batch.id)).every((item) => item.status === 'pending')).toBe(true);
    expect(deps.files.keys().filter((k) => k.includes('/applications/'))).toEqual([]);
    const done = await commitImport(deps, { organizationId: ORG_A, batchId: batch.id });
    expect(done).toMatchObject({ status: 'done', counts: { imported: 2, failed: 0 } });
  });

  it('retries an item in place after a transient error inside its savepoint', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await requestImportCommit(deps, recruiter, { batchId: batch.id });
    let calls = 0;
    const once = {
      ...deps,
      newSecret: () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('serialization failure'), { code: '40001' });
        return `consent-secret-${calls}-abcdefghijkl`;
      },
    };
    const { commitImport } = await import('./commit-import.js');
    expect(await commitImport(once, { organizationId: ORG_A, batchId: batch.id })).toMatchObject({ status: 'done', counts: { imported: 1, failed: 0 } });
  });

  it('keeps the reconfirmation as a queued message when its delivery cannot be queued, for the reconciler', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await requestImportCommit(deps, recruiter, { batchId: batch.id });
    const { commitImport } = await import('./commit-import.js');
    const done = await commitImport({ ...deps, queue: createInMemoryTaskQueue(new Error('queue down')) }, { organizationId: ORG_A, batchId: batch.id });
    expect(done).toMatchObject({ status: 'done', counts: { imported: 1, emailsQueued: 1 } });
    expect(deps.messagingStore.read().messages).toMatchObject([{ status: 'queued' }]);
    expect(deps.mailErrors).toHaveLength(1);
  });

  it('works through chunks of 50', async () => {
    const deps = importWorld();
    const people = Array.from({ length: 120 }, (_, i) => ({ file: `p${i}.pdf`, name: `Persona${i} Test`, email: `p${i}@example.com` }));
    const batch = await readyBatch(deps, people, []);
    const done = await commit(deps, batch.id);
    expect(done.counts).toMatchObject({ imported: 120, emailsQueued: 120 });
  });
});

describe('undoImport', () => {
  it('erases everything the batch created, with reason import_undone, and leaves reconfirmed people', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO, GIULIA], [MARIO_ROW, GIULIA_ROW]);
    await commit(deps, batch.id);
    const mario = deps.store.read().applications.find((a) => a.cv?.fileName.startsWith('Mario'))!;
    const secret = (await deliverQueued(deps)).get(mario.id)!;
    await answerConsentRequest(deps, { token: secret, scopes: ['selection'] });
    const result = await undoImport(deps, recruiter, { batchId: batch.id });
    expect(result).toMatchObject({ erased: 1, skippedReconfirmed: 1, failed: 0, batch: { status: 'undone', counts: { erased: 1, skippedReconfirmed: 1 } } });
    expect(deps.store.read().candidates.map((c) => c.email)).toContain('mario@example.com');
    expect(deps.store.read().candidates.some((c) => c.email === 'giulia@example.com')).toBe(false);
    expect(deps.store.read().applications.some((a) => a.cv?.fileName.startsWith('Giulia'))).toBe(false);
    expect(deps.auditLog.events().filter((e) => e.action === 'candidate.erased').at(-1)).toMatchObject({ metadata: { reason: 'import_undone', applicationCount: 1 } });
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'import.undone', metadata: { erased: 1, skippedReconfirmed: 1 } });
    expect(await rejection(undoImport(deps, recruiter, { batchId: batch.id }))).toBeInstanceOf(ConflictError);
  });

  it('on an existing candidate removes only what the batch added', async () => {
    const existing = buildCandidate({ organizationId: ORG_A, id: 'cand_9', email: 'mario@example.com' });
    const earlier = buildApplication({ organizationId: ORG_A, id: 'app_9', candidateId: 'cand_9', jobId: JOB_2, outcome: 'not_selected', closedAt: new Date('2026-03-01T00:00:00Z'), cv: { key: 'organizations/org_a/applications/app_9/cv', fileName: 'old.pdf', mediaType: 'application/pdf', sizeBytes: 64 } });
    const deps = importWorld({ candidates: [existing], applications: [earlier] });
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await commit(deps, batch.id);
    expect(deps.store.read().applications).toHaveLength(2);
    const result = await undoImport(deps, recruiter, { batchId: batch.id });
    expect(result).toMatchObject({ erased: 1, skippedReconfirmed: 0 });
    expect(deps.store.read().candidates).toEqual([existing]);
    expect(deps.store.read().applications).toEqual([earlier]);
    expect(deps.store.read().notes).toEqual([]);
    expect(deps.auditLog.events().filter((e) => e.action === 'candidate.erased').at(-1)).toMatchObject({ metadata: { reason: 'import_undone' } });
  });

  it('keeps the batch done and reports failures so the undo can run again', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await commit(deps, batch.id);
    const real = deps.erasure;
    const flaky = { ...deps, erasure: { run: async () => Promise.reject(new Error('db down')) } };
    const first = await undoImport(flaky, recruiter, { batchId: batch.id });
    expect(first).toMatchObject({ failed: 1, erased: 0, batch: { status: 'done' } });
    const second = await undoImport({ ...deps, erasure: real }, recruiter, { batchId: batch.id });
    expect(second).toMatchObject({ failed: 0, erased: 1, batch: { status: 'undone' } });
  });

  it('counts an erasure whose files could not be deleted or queued as erased: the database commit stands', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await commit(deps, batch.id);
    const broken = { ...deps, files: { ...deps.files, delete: async () => Promise.reject(new Error('s3 down')) }, queue: createInMemoryTaskQueue(new Error('queue down')) };
    const result = await undoImport(broken, recruiter, { batchId: batch.id });
    expect(result).toMatchObject({ erased: 1, failed: 0, batch: { status: 'undone', counts: { erased: 1 } } });
    expect(deps.store.read().applications.filter((a) => a.importBatchId === batch.id)).toEqual([]);
  });

  it('can undo a failed batch that had already imported people', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await requestImportCommit(deps, recruiter, { batchId: batch.id });
    await commitImport(deps, { organizationId: ORG_A, batchId: batch.id });
    deps.importStore.write({ batches: deps.importStore.read().batches.map((b) => ({ ...b, status: 'failed' as const })) });
    const result = await undoImport(deps, recruiter, { batchId: batch.id });
    expect(result).toMatchObject({ erased: 1, batch: { status: 'undone' } });
  });

  it('only undoes a batch that is done or failed', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    expect(await rejection(undoImport(deps, recruiter, { batchId: batch.id }))).toBeInstanceOf(ConflictError);
  });
});

